import useGovernanceAssets from '@hooks/useGovernanceAssets'
import React, { useMemo } from 'react'
import AccountItem from './AccountItem'
import { useJupiterPricesByMintsQuery } from '../../hooks/queries/jupiterPrice'
import { PublicKey } from '@solana/web3.js'
import { WSOL_MINT } from '../instructions/tools'
import BigNumber from 'bignumber.js'
import { getTreasuryAccountItemInfoV3 } from '../../utils/treasuryToolsV3'

const AccountsItems = () => {
  const {
    governedTokenAccountsWithoutNfts,
    auxiliaryTokenAccounts,
  } = useGovernanceAssets()

  const accounts = useMemo(() => {
    const allAccounts = [
      ...(governedTokenAccountsWithoutNfts || []),
      ...(auxiliaryTokenAccounts || []),
    ]
    return allAccounts.filter(Boolean)
  }, [governedTokenAccountsWithoutNfts, auxiliaryTokenAccounts])

  const mintsToFetch = useMemo(() => {
    return [
      ...governedTokenAccountsWithoutNfts,
      ...auxiliaryTokenAccounts,
    ]
      .filter((x) => typeof x.extensions.mint !== 'undefined')
      .map((x) => x.extensions.mint!.publicKey)
  }, [governedTokenAccountsWithoutNfts, auxiliaryTokenAccounts])

  const { data: prices } = useJupiterPricesByMintsQuery([
    ...mintsToFetch,
    new PublicKey(WSOL_MINT),
  ])

  const sortedAccounts = useMemo(() => {
    if (!accounts.length || !prices) return []

    try {
      const accountsWithInfo = accounts.map((account) => {
        try {
          const info = getTreasuryAccountItemInfoV3(account)
          // Override the price/total price with Jupiter price data
          const mintAddress = account.extensions.mint?.publicKey.toBase58()
          const jupiterPrice = mintAddress && Object.keys(prices || {}).length > 0 ? prices[mintAddress]?.price ?? 0 : 0
          const amount = info.decimalAdjustedAmount
          const totalPrice = amount * jupiterPrice

          return {
            account,
            info: {
              ...info,
              totalPrice,
              displayPrice: totalPrice ? new BigNumber(totalPrice).toFormat(0) : ''
            }
          }
        } catch (err) {
          console.error(`Error processing account ${account?.pubkey?.toString()}:`, err)
          return null
        }
      })

      const validAccounts = accountsWithInfo
        .filter((item) => item !== null)
        .sort((a, b) => b.info.totalPrice - a.info.totalPrice)

      const maxTokens = Number(process?.env?.MAIN_VIEW_SHOW_MAX_TOP_TOKENS_NUM) || accounts.length
      return validAccounts.slice(0, maxTokens)
    } catch (err) {
      console.error('Error sorting accounts:', err)
      return [] 
    }
  }, [accounts, prices])

  return (
    <div className="space-y-3">
      {sortedAccounts.map(({ account, info }) => (
        <AccountItem
          governedAccountTokenAccount={account}
          treasuryInfo={info}
          key={account?.extensions?.transferAddress?.toBase58() || account?.pubkey?.toBase58()}
        />
      ))}
    </div>
  )
}

export default AccountsItems