import { BigNumber } from 'bignumber.js'
import { AssetAccount } from '@utils/uiTypes/assets'
import { getAccountAssetCount } from './getAccountAssetCount'
import { fetchJupiterPrice } from '../queries/jupiterPrice'

export const getAccountValueV2 = async (account: AssetAccount) => {
  if (!account.extensions.mint) {
    return {
      value: new BigNumber(0),
      price: new BigNumber(0),
    }
  }

  const count = getAccountAssetCount(account)
  const priceObj = await fetchJupiterPrice(account.extensions.mint.publicKey)
  const price = priceObj?.found && priceObj?.result?.price ? priceObj.result.price : 0
  return {
    value: count.multipliedBy(new BigNumber(price)),
    price: new BigNumber(price),
  }
}

