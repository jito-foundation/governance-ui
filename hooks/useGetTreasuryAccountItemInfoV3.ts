import { getAccountName, WSOL_MINT } from '@components/instructions/tools'
import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { getMintDecimalAmountFromNatural } from '@tools/sdk/units'
import BigNumber from 'bignumber.js'
import { abbreviateAddress } from '@utils/formatting'
import { AccountType, AssetAccount } from '@utils/uiTypes/assets'
import { useJupiterPriceByMintQuery } from './queries/jupiterPrice'
import { useTokenMetadata } from './queries/tokenMetadata'
import { useMemo } from 'react'

export const useGetTreasuryAccountItemInfoV3 = (account: AssetAccount) => {
  // Memoize these values since they're used in multiple places
  const mintPubkey = useMemo(() => 
    account.extensions.mint?.publicKey,
    [account.extensions.mint]
  )

  const mintAddress = useMemo(() =>
    account.type === AccountType.SOL
      ? WSOL_MINT
      : mintPubkey?.toBase58(),
    [account.type, mintPubkey]
  )

  const decimalAdjustedAmount = useMemo(() => 
    account.extensions.amount && account.extensions.mint
      ? getMintDecimalAmountFromNatural(
          account.extensions.mint.account,
          new BN(
            account.isSol
              ? account.extensions.solAccount!.lamports
              : account.extensions.amount
          )
        ).toNumber()
      : 0
  , [account])

  const { data: priceData } = useJupiterPriceByMintQuery(mintPubkey)
  const { data: tokenMetadata } = useTokenMetadata(mintPubkey, true)
  // const info = tokenPriceService.getTokenInfo(mintAddress!)

  const amountFormatted = useMemo(() => 
    new BigNumber(decimalAdjustedAmount).toFormat()
  , [decimalAdjustedAmount])

  // Handle symbol with metadata fallback
  const symbol = useMemo(() => {
    if (account.type === AccountType.NFT) return 'NFTS'
    if (account.type === AccountType.SOL) return 'SOL'
    
    // Try to get from metadata first
    const metadataSymbol = tokenMetadata?.symbol
      ?.replace(/\0/g, '')
      ?.replace(/\s+/g, ' ')
      ?.trim()
    
    if (metadataSymbol) return metadataSymbol
    
    // Fallback to abbreviated address
    return account.extensions.mint
      ? abbreviateAddress(account.extensions.mint.publicKey)
      : ''
  }, [account, tokenMetadata])

  const accountName = account.pubkey ? getAccountName(account.pubkey) : ''
  const name = useMemo(() => 
    accountName || (
      account.extensions.transferAddress
        ? abbreviateAddress(account.extensions.transferAddress as PublicKey)
        : ''
    )
  , [accountName, account.extensions.transferAddress])

  const totalPrice = useMemo(() => {
    if (!decimalAdjustedAmount || !priceData?.result?.price) return 0
    try {
      return decimalAdjustedAmount * priceData.result.price
    } catch (error) {
      console.error('Error calculating total price:', error)
      return 0
    }
  }, [decimalAdjustedAmount, priceData])

  const displayPrice = useMemo(() => {
    if (!totalPrice) return ''
    try {
      return new BigNumber(totalPrice).toFormat(0)
    } catch (error) {
      console.error('Error formatting display price:', error)
      return ''
    }
  }, [totalPrice])

  return {
    decimalAdjustedAmount,
    amountFormatted,
    name,
    symbol,
    totalPrice,
    displayPrice,
    logo: `https://jito.network/coinsByMint/${mintAddress}.webp`,
    // logo: tokenMetadata?.image || '', // Use image instead of logoURI
    mintPubkey,
    mintAddress,
  }
}