import { useMemo } from 'react'
import { BN } from '@coral-xyz/anchor'
import { getMintDecimalAmountFromNatural } from '@tools/sdk/units'
import BigNumber from 'bignumber.js'
import useGovernanceAssets from './useGovernanceAssets'
import { useJupiterPricesByMintsQuery } from './queries/jupiterPrice'
import { PublicKey } from '@metaplex-foundation/js'
import { WSOL_MINT } from '@components/instructions/tools'
import { AccountType } from '@utils/uiTypes/assets'
import { useMangoAccountsTreasury } from './useMangoAccountsTreasury'

export function useTotalTreasuryPrice() {
  const {
    governedTokenAccountsWithoutNfts,
    assetAccounts,
    auxiliaryTokenAccounts,
  } = useGovernanceAssets()

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

  const { mangoAccountsValue, isFetching } = useMangoAccountsTreasury(
    assetAccounts
  )

  const totalTokensPrice = useMemo(() => {
    return [
      ...governedTokenAccountsWithoutNfts,
      ...auxiliaryTokenAccounts,
    ]
      .filter((x) => typeof x.extensions.mint !== 'undefined')
      .map((x) => {
        return (
          getMintDecimalAmountFromNatural(
            x.extensions.mint!.account,
            new BN(
              x.isSol
                ? x.extensions.solAccount!.lamports
                : x.isToken || x.type === AccountType.AUXILIARY_TOKEN
                ? x.extensions.token!.account?.amount
                : 0
            )
          ).toNumber() *
          (prices?.[x.extensions.mint!.publicKey.toBase58()]?.price ?? 0)
        )
      })
      .reduce((acc, val) => acc + val, 0)
  }, [governedTokenAccountsWithoutNfts, auxiliaryTokenAccounts, prices])

  const stakeAccountsTotalPrice = useMemo(() => {
    return assetAccounts
      .filter((x) => x.extensions.stake)
      .map((x) => {
        return x.extensions.stake!.amount * (prices?.[WSOL_MINT]?.price ?? 0)
      })
      .reduce((acc, val) => acc + val, 0)
  }, [assetAccounts, prices])

  const totalPrice = useMemo(() => {
    return totalTokensPrice + stakeAccountsTotalPrice
  }, [totalTokensPrice, stakeAccountsTotalPrice])

  const totalPriceFormatted = useMemo(() => {
    return (governedTokenAccountsWithoutNfts.length
      ? new BigNumber(totalPrice)
      : new BigNumber(0)
    ).plus(mangoAccountsValue)
  }, [governedTokenAccountsWithoutNfts.length, totalPrice, mangoAccountsValue])

  return {
    isFetching,
    totalPriceFormatted,
  }
}
