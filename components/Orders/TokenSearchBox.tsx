import useGovernanceAssets from '@hooks/useGovernanceAssets'
import { PublicKey } from '@solana/web3.js'
import { SideMode } from '@utils/orders'
import TokenItem from './TokenItem'
import { AssetAccount } from '@utils/uiTypes/assets'

export default function TokenSearchBox({
  mode,
  wallet,
  selectTokenAccount,
}: {
  mode: SideMode
  wallet?: PublicKey
  selectTokenAccount: (assetAccount: AssetAccount) => void
}) {
  const { governedTokenAccountsWithoutNfts, governedNativeAccounts } =
    useGovernanceAssets()

  const availableTokenAccounts = [
    governedNativeAccounts.find(
      (x) => x.extensions.transferAddress === wallet,
    )!,
    ...(governedTokenAccountsWithoutNfts?.filter(
      (x) => wallet && x.extensions.token?.account.owner.equals(wallet),
    ) || []),
  ]

  return (
    <div className="flex flex-col items-center border border-bkg-4 my-3 rounded ">
      <div className="flex flex-col overflow-auto max-h-[500px] w-full">
        {availableTokenAccounts.map((acc) => (
          <TokenItem
            selectTokenAccount={selectTokenAccount}
            key={acc.pubkey.toBase58()}
            assetAccount={acc}
          ></TokenItem>
        ))}
      </div>
    </div>
  )
}
