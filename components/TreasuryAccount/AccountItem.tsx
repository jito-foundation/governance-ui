import { useEffect, useState, useMemo } from 'react'
import { getTreasuryAccountItemInfoV2Async } from '@utils/treasuryTools'
import { AssetAccount } from '@utils/uiTypes/assets'
import TokenIcon from '@components/treasuryV2/icons/TokenIcon'
import { useTokenMetadata } from '@hooks/queries/tokenMetadata'
import { useJupiterPriceByMintQuery } from '../../hooks/queries/jupiterPrice'
import BigNumber from 'bignumber.js'

const AccountItem = ({
  governedAccountTokenAccount,
}: {
  governedAccountTokenAccount: AssetAccount
}) => {
  const [accountAssetInfo, setAccountAssetInfo] = useState({
    amountFormatted: '',
    logo: '',
    name: '',
    symbol: '',
    displayPrice: '',
  })

  useEffect(() => {
    const fetchAccounAssetInfo = async () => {
      try {
        const info = await getTreasuryAccountItemInfoV2Async(
          governedAccountTokenAccount,
        )
        setAccountAssetInfo(info)
      } catch (error) {
        console.error('Error fetching treasury account info:', error)
      }
    }

    fetchAccounAssetInfo()
  }, [governedAccountTokenAccount])

  const { data: priceData } = useJupiterPriceByMintQuery(
    governedAccountTokenAccount.extensions.mint?.publicKey
  )

  const { data } = useTokenMetadata(
    governedAccountTokenAccount.extensions.mint?.publicKey,
    !accountAssetInfo.logo,
  )

  const symbolFromMeta = useMemo(() => {
    // data.symbol is kinda weird
    //Handle null characters, whitespace, and ensure fallback to symbol
    const cleanSymbol = data?.symbol
      ?.replace(/\0/g, '')  // Remove null characters
      ?.replace(/\s+/g, ' ') // Normalize whitespace to single spaces
      ?.trim() // Remove leading/trailing whitespace
    
    return cleanSymbol || symbol || ''
  }, [data?.symbol, symbol])

  const displayPrice = useMemo(() => {
    if (!decimalAdjustedAmount || !priceData?.result?.price) return ''
    
    try {
      const totalPrice = decimalAdjustedAmount * priceData.result.price
      return new BigNumber(totalPrice).toFormat(0)
    } catch (error) {
      console.error('Error calculating display price:', error)
      return ''
    }
  }, [priceData, decimalAdjustedAmount])

  const { amountFormatted, logo, name, symbol, displayPrice } = accountAssetInfo

  return (
    <div className="flex items-center w-full p-3 border rounded-lg text-fgd-1 border-fgd-4">
      {logo ? (
        <img
          className={`flex-shrink-0 h-6 w-6 mr-2.5 mt-0.5 ${
            governedAccountTokenAccount.isSol ? 'rounded-full' : ''
          }`}
          src={logo}
          onError={({ currentTarget }) => {
            currentTarget.onerror = null
            currentTarget.hidden = true
          }}
          alt={`${name} logo`}
        />
      ) : (
        <TokenIcon
          className="flex-shrink-0 h-6 w-6 mr-2.5 mt-0.5 fill-current"
        />
      )}
      <div className="w-full">
        <div className="flex items-start justify-between mb-1">
          <div className="text-sm font-semibold text-th-fgd-1">
            {name || 'Unknown Token'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-fgd-3">
          <div>
            {amountFormatted}
            {symbolFromMeta && ` ${symbolFromMeta}`}
          </div>
          {displayPrice && (
            <div className="text-gray-600">
              (${displayPrice})
            </div>
          )}
        </div>
        <div className="mt-0.5 text-fgd-3 text-xs">≈${displayPrice || 0}</div>
      </div>
    </div>
  )
}

export default AccountItem