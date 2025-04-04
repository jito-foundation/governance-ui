import { Connection, PublicKey } from '@solana/web3.js'
import axios from 'axios'
import { getConnectionContext } from 'utils/connection'
import {
  getGovernanceAccounts,
  Governance,
  Proposal,
  ProposalState,
  pubkeyFilter,
} from '@solana/spl-governance'
import { getCertifiedRealmInfo } from '@models/registry/api'
import { accountsToPubkeyMap } from '@tools/sdk/accounts'
import { fmtTokenAmount } from '@utils/formatting'
import { formatNumber } from '@utils/formatNumber'

const thirtyMinutesSeconds = 30 * 60
const toleranceSeconds = 30

const maxRetries = 4
const retryDelay = 5000

async function sendWebhook(webhookUrl, data, retries = maxRetries) {
  try {
    await axios.post(webhookUrl, data)
    console.log('Webhook Triggered Successfully')
  } catch (error) {
    console.error('Webhook Trigger Failed:', error.message)
    if (retries > 0) {
      console.log(`Retrying... Attempts left: ${retries}`)
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
      await sendWebhook(webhookUrl, data, retries - 1)
    } else {
      console.error('All retries failed')
    }
  }
}

if (!process.env.MAINNET_RPC) {
  console.error('Please set MAINNET_RPC to a rpc node of choice!')
  process.exit(1)
}

export function errorWrapper() {
  console.log("Running in errorWrapper")
  runNotifier().catch((error) => {
    console.error(error)
  })
}

const REALM = 'Jito'
const MIN_VOTES_NEEDED = 30_000_000

export async function runNotifier(summaryOnly = false) {
  console.log('Starting governance notifier')
  const connectionContext = getConnectionContext('mainnet')
  const realmInfo = await getCertifiedRealmInfo(REALM, connectionContext)

  const connection = new Connection(process.env.MAINNET_RPC!)
  console.log(`- getting all governance accounts for ${REALM}`)
  const governances = await getGovernanceAccounts(
    connection,
    realmInfo!.programId,
    Governance,
    [pubkeyFilter(1, realmInfo!.realmId)!]
  )

  const governancesMap = accountsToPubkeyMap(governances)

  console.log(`- getting all proposals for all governances`)
  const proposalsByGovernance = await Promise.all(
    Object.keys(governancesMap).map((governancePk) => {
      return getGovernanceAccounts(connection, realmInfo!.programId, Proposal, [
        pubkeyFilter(1, new PublicKey(governancePk))!,
      ])
    })
  )

  console.log(`- scanning all '${REALM}' proposals`)
  let countJustOpenedForVoting = 0
  let countOpenForVotingSinceSomeTime = 0
  let countVotingNotStartedYet = 0
  let countClosed = 0
  let countCancelled = 0
  const nowInSeconds = new Date().getTime() / 1000
  for (const proposals_ of proposalsByGovernance) {
    for (const proposal of proposals_) {
      //// debugging
      // console.log(
      //   `-- proposal ${proposal.account.governance.toBase58()} - ${
      //     proposal.account.name
      //   }`
      // )

      if (
        // proposal is cancelled
        proposal.account.state === ProposalState.Cancelled
      ) {
        countCancelled++
        continue
      }

      if (
        // voting is closed
        proposal.account.votingCompletedAt
      ) {
        if (
          nowInSeconds - proposal.account.votingCompletedAt.toNumber() <=
          thirtyMinutesSeconds + toleranceSeconds
        ) {
          const votingTokenDecimals = 6
          const yesVotes = fmtTokenAmount(
            proposal.account.getYesVoteCount(),
            votingTokenDecimals
          )
          const noVotes = fmtTokenAmount(
            proposal.account.getNoVoteCount(),
            votingTokenDecimals
          )

          const quorumReached = yesVotes >= MIN_VOTES_NEEDED
          const isSuccess = yesVotes > noVotes && quorumReached

          const msg = `
          Proposal Ended: ${proposal.account.name}
          
          Status: ${
            isSuccess
              ? 'Success'
              : !quorumReached
              ? 'Defeated - Quorum Not Reached'
              : 'Defeated'
          }
          
          🗳️ Voting Breakdown:
          - Yes Votes: ${formatNumber(yesVotes, undefined, {
            minimumFractionDigits: 0,
          })}
          - No Votes: ${formatNumber(noVotes, undefined, {
            minimumFractionDigits: 0,
          })}
          
          🔗 https://realms.today/dao/${escape(
            REALM
          )}/proposal/${proposal.pubkey.toBase58()}`

          console.log(msg)
          if (!summaryOnly && process.env.WEBHOOK_URL) {
            await sendWebhook(process.env.WEBHOOK_URL, {
              content: msg,
            })
          }
        }
        countClosed++
        continue
      }

      if (
        // voting has not started yet
        !proposal.account.votingAt
      ) {
        countVotingNotStartedYet++
        continue
      }

      if (
        // proposal opened in last 5 mins
        nowInSeconds - proposal.account.votingAt.toNumber() <=
        thirtyMinutesSeconds + toleranceSeconds
        // proposal opened in last 24 hrs - useful to notify when bot recently stopped working
        // and missed the 5 min window
        // (nowInSeconds - proposal.info.votingAt.toNumber())/(60 * 60) <=
        // 24
      ) {
        countJustOpenedForVoting++

        const msg = `“${
          proposal.account.name
        }” proposal just opened for voting 🗳 https://realms.today/dao/${escape(
          REALM
        )}/proposal/${proposal.pubkey.toBase58()}`

        console.log(msg)
        if (!summaryOnly && process.env.WEBHOOK_URL) {
          await sendWebhook(process.env.WEBHOOK_URL, {
            content: msg,
          })
        }
      }
      // note that these could also include those in finalizing state, but this is just for logging
      else if (proposal.account.state === ProposalState.Voting) {
        countOpenForVotingSinceSomeTime++

        //// in case bot has an issue, uncomment, and run from local with webhook url set as env var
        // const msg = `“${
        //     proposal.account.name
        // }” proposal just opened for voting 🗳 https://realms.today/dao/${escape(
        //     REALM
        // )}/proposal/${proposal.pubkey.toBase58()}`
        //
        // console.log(msg)
        // if (process.env.WEBHOOK_URL) {
        //   axios.post(process.env.WEBHOOK_URL, { content: msg })
        // }
      }

      const remainingInSeconds =
        governancesMap[proposal.account.governance.toBase58()].account.config
          .baseVotingTime +
        proposal.account.votingAt.toNumber() -
        nowInSeconds
      if (
        remainingInSeconds > 86400 &&
        remainingInSeconds < 86400 + thirtyMinutesSeconds + toleranceSeconds
      ) {
        const msg = `“${
          proposal.account.name
        }” proposal will close for voting 🗳 https://realms.today/dao/${escape(
          REALM
        )}/proposal/${proposal.pubkey.toBase58()} in 24 hrs`

        console.log(msg)
        if (!summaryOnly && process.env.WEBHOOK_URL) {
          await sendWebhook(process.env.WEBHOOK_URL, {
            content: msg,
          })
        }
      }
    }
  }

  const summary = `countOpenForVotingSinceSomeTime: ${countOpenForVotingSinceSomeTime}, countJustOpenedForVoting: ${countJustOpenedForVoting}, countVotingNotStartedYet: ${countVotingNotStartedYet}, countClosed: ${countClosed}, countCancelled: ${countCancelled}`

  if (summaryOnly && process.env.WEBHOOK_URL) {
    console.log('Nothing urgent to Report')
    await sendWebhook(process.env.WEBHOOK_URL, {
      content: 'Nothing urgent to Report: ' + summary,
    })
  }

  console.log(summary)
}

errorWrapper()