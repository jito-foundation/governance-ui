import { ArrowCircleDownIcon, ArrowCircleUpIcon } from '@heroicons/react/solid'
import useTreasuryAccountStore from 'stores/useTreasuryAccountStore'
import AccountLabel from './AccountHeader'
import GovernedAccountSelect from 'pages/dao/[symbol]/proposal/components/GovernedAccountSelect'
import useGovernanceAssets from '@hooks/useGovernanceAssets'
import React, { useEffect, useState } from 'react'
import {
  StakingViewForm,
  UiInstruction,
} from '@utils/uiTypes/proposalCreationTypes'
import { getMintMinAmountAsDecimal } from '@tools/sdk/units'
import Input from '@components/inputs/Input'
import Textarea from '@components/inputs/Textarea'
import { precision } from '@utils/formatting'
import useRealm from '@hooks/useRealm'
import VoteBySwitch from 'pages/dao/[symbol]/proposal/components/VoteBySwitch'
import Button from '@components/Button'
import Tooltip from '@components/Tooltip'
import { getStakeSchema } from '@utils/validations'
import { getConvertToJitoSolInstruction } from '@utils/instructionTools'
import { getInstructionDataFromBase64 } from '@solana/spl-governance'
import useQueryContext from '@hooks/useQueryContext'
import { useRouter } from 'next/router'
import { notify } from '@utils/notifications'
import useCreateProposal from '@hooks/useCreateProposal'
import { AssetAccount } from '@utils/uiTypes/assets'
import useWalletOnePointOh from '@hooks/useWalletOnePointOh'
import { useRealmQuery } from '@hooks/queries/realm'
import useLegacyConnectionContext from '@hooks/useLegacyConnectionContext'
import { useVoteByCouncilToggle } from '@hooks/useVoteByCouncilToggle'
import { PublicKey } from '@solana/web3.js'

export const JITOSOL_MINT_ADDRESS = new PublicKey(
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
)

export const JITO_STAKE_POOL_ACCOUNT = new PublicKey(
  'Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb',
)

const defaultFormState = {
  destinationAccount: undefined,
  amount: undefined,
  governedTokenAccount: undefined,
  title: '',
  description: '',
}

const notConnectedMessage =
  'You need to be connected to your wallet to have the ability to create a staking proposal'

const getProposalText = (amount) => {
  return `Convert ${amount} SOL to JitoSOL`
}

const ConvertToJitoSol = () => {
  const realm = useRealmQuery().data?.result
  const { symbol } = useRealm()
  const { canUseTransferInstruction } = useGovernanceAssets()
  const { governedTokenAccounts } = useGovernanceAssets()
  const { fmtUrlWithCluster } = useQueryContext()
  const router = useRouter()
  const { handleCreateProposal } = useCreateProposal()
  const connection = useLegacyConnectionContext()
  const wallet = useWalletOnePointOh()
  const currentAccount = useTreasuryAccountStore((s) => s.currentAccount)

  const [formErrors, setFormErrors] = useState({})
  const [form, setForm] = useState<StakingViewForm>(defaultFormState)
  const [showOptions, setShowOptions] = useState(false)
  const { voteByCouncil, shouldShowVoteByCouncilToggle, setVoteByCouncil } =
    useVoteByCouncilToggle()
  const [isLoading, setIsLoading] = useState(false)

  const jitoSolTokenAccounts = governedTokenAccounts.filter(
    (acc) =>
      acc.extensions.mint?.publicKey.toString() ===
      JITOSOL_MINT_ADDRESS.toString(),
  )
  const mintMinAmount = form.governedTokenAccount?.extensions?.mint
    ? getMintMinAmountAsDecimal(
        form.governedTokenAccount.extensions.mint.account,
      )
    : 1
  const schema = getStakeSchema({ form })

  const handleSetForm = ({ propertyName, value }) => {
    setFormErrors({})
    setForm({ ...form, [propertyName]: value })
  }

  const handlePropose = async () => {
    if (currentAccount?.governance === undefined) throw new Error()

    setIsLoading(true)
    const instruction: UiInstruction = await getConvertToJitoSolInstruction({
      schema,
      form,
      connection,
      wallet,
      setFormErrors,
    })

    if (instruction.isValid) {
      if (!realm) {
        setIsLoading(false)
        throw 'No realm selected'
      }

      const governance = currentAccount?.governance
      const holdUpTime = governance?.account?.config.minInstructionHoldUpTime

      const instructionData = {
        data: instruction.serializedInstruction
          ? getInstructionDataFromBase64(instruction.serializedInstruction)
          : null,
        holdUpTime: holdUpTime,
        prerequisiteInstructions: instruction.prerequisiteInstructions || [],
      }

      try {
        const proposalAddress = await handleCreateProposal({
          title: form.title ? form.title : getProposalText(form.amount),
          description: form.description ? form.description : '',
          governance: currentAccount?.governance,
          instructionsData: [instructionData],
          voteByCouncil,
          isDraft: false,
        })
        const url = fmtUrlWithCluster(
          `/dao/${symbol}/proposal/${proposalAddress}`,
        )
        router.push(url)
      } catch (ex) {
        notify({ type: 'error', message: `${ex}` })
      }
    }
    setIsLoading(false)
  }

  useEffect(() => {
    handleSetForm({
      value: currentAccount,
      propertyName: 'governedTokenAccount',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO please fix, it can cause difficult bugs. You might wanna check out https://bobbyhadz.com/blog/react-hooks-exhaustive-deps for info. -@asktree
  }, [currentAccount, form.destinationAccount])

  return (
    <>
      <h3 className="mb-4 flex items-center">Convert SOL to JitoSOL</h3>
      <AccountLabel></AccountLabel>
      <div className="space-y-4 w-full pb-4">
        {jitoSolTokenAccounts.length > 0 && (
          <GovernedAccountSelect
            label="JitoSOL Treasury account"
            governedAccounts={jitoSolTokenAccounts as AssetAccount[]}
            shouldBeGoverned={false}
            governance={currentAccount?.governance}
            value={form.destinationAccount}
            onChange={(evt) =>
              handleSetForm({
                value: evt,
                propertyName: 'destinationAccount',
              })
            }
            error={formErrors['destinationAccount']}
            noMaxWidth={true}
          ></GovernedAccountSelect>
        )}
        <Input
          min={mintMinAmount}
          label="Amount SOL"
          type="number"
          value={form.amount}
          step={mintMinAmount}
          onChange={(evt) =>
            handleSetForm({
              value: evt.target.value,
              propertyName: 'amount',
            })
          }
          onBlur={(evt) =>
            handleSetForm({
              value: parseFloat(
                Math.max(
                  Number(mintMinAmount),
                  Math.min(
                    Number(Number.MAX_SAFE_INTEGER),
                    Number(evt.target.value),
                  ),
                ).toFixed(precision(mintMinAmount)),
              ),
              propertyName: 'amount',
            })
          }
          error={formErrors['amount']}
          noMaxWidth={true}
        />
        <div
          className="flex items-center hover:cursor-pointer w-24"
          onClick={() => setShowOptions(!showOptions)}
        >
          <div className="h-4 w-4 mr-1 text-primary-light">
            {showOptions ? <ArrowCircleUpIcon /> : <ArrowCircleDownIcon />}
          </div>
          <small className="text-fgd-3">Options</small>
        </div>
        {showOptions && (
          <>
            <Input
              noMaxWidth={true}
              label="Title"
              value={form.title}
              type="text"
              placeholder={
                form.amount && form.destinationAccount
                  ? getProposalText(form.amount)
                  : 'Title of your proposal'
              }
              onChange={(evt) =>
                handleSetForm({
                  value: evt.target.value,
                  propertyName: 'title',
                })
              }
            />
            <Textarea
              noMaxWidth={true}
              label="Description"
              placeholder={
                'Description of your proposal or use a github gist link (optional)'
              }
              wrapperClassName="mb-5"
              value={form.description}
              onChange={(evt) =>
                handleSetForm({
                  value: evt.target.value,
                  propertyName: 'description',
                })
              }
            ></Textarea>
            {shouldShowVoteByCouncilToggle && (
              <VoteBySwitch
                checked={voteByCouncil}
                onChange={() => {
                  setVoteByCouncil(!voteByCouncil)
                }}
              ></VoteBySwitch>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0 mt-4">
        <Button
          className="ml-auto"
          disabled={!canUseTransferInstruction || isLoading}
          onClick={handlePropose}
          isLoading={isLoading}
        >
          <Tooltip content={!canUseTransferInstruction && notConnectedMessage}>
            Propose
          </Tooltip>
        </Button>
      </div>
    </>
  )
}

export default ConvertToJitoSol
