import { AssetAccount, TreasuryAccountItemInfo } from '@utils/uiTypes/assets'
import TokenIcon from '@components/treasuryV2/icons/TokenIcon'
import { useTokenMetadata } from '@hooks/queries/tokenMetadata'
import { useMemo, useState } from 'react'

type AccountItemProps = {
  governedAccountTokenAccount: AssetAccount
  treasuryInfo: TreasuryAccountItemInfo
}

const AccountItem = ({
  governedAccountTokenAccount,
  treasuryInfo,
}: AccountItemProps) => {
  const [imgError, setImgError] = useState(false)

  const {
    amountFormatted,
    logo,
    name,
    symbol,
    displayPrice,
    mintPubkey,
  } = treasuryInfo || {}

  const { data: tokenMetadata } = useTokenMetadata(
    mintPubkey,
    !logo
  )

  const symbolFromMeta = useMemo(() => {
    const cleanSymbol = tokenMetadata?.symbol
      ?.replace(/\0/g, '')
      ?.replace(/\s+/g, ' ')
      ?.trim()

    return cleanSymbol || symbol || ''
  }, [tokenMetadata?.symbol, symbol])

  return (
    <div className="flex items-center w-full p-3 border rounded-lg text-fgd-1 border-fgd-4">
      {logo && !imgError ? (
        <img
          className={`flex-shrink-0 h-6 w-6 mr-2.5 mt-0.5 ${governedAccountTokenAccount.isSol ? 'rounded-full' : ''
            }`}
          src={logo}
          onError={({ currentTarget }) => {
            currentTarget.onerror = null
            setImgError(true)
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
      </div>
    </div>
  )
}

export default AccountItem