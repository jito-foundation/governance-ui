import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import queryClient from './queryClient'

const PRICE_URL = 'https://lite-api.jup.ag/price/v3'

/* example query - Price API V3
# Unit price of 1 JUP & 1 SOL based on the Derived Price in USDC
https://lite-api.jup.ag/price/v3?ids=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,So11111111111111111111111111111111111111112

{
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": {
    "usdPrice": 0.4056018512541055,
    "blockId": 348004026,
    "decimals": 6,
    "priceChange24h": 0.5292887924920519
  },
  "So11111111111111111111111111111111111111112": {
    "usdPrice": 147.4789340738336,
    "blockId": 348004023,
    "decimals": 9,
    "priceChange24h": 1.2907622140620008
  }
}
*/

// Price API V3 Response
type PriceV3Response = {
  usdPrice: number
  blockId: number
  decimals: number
  priceChange24h?: number
}

// Internal Price format (for backwards compatibility)
type Price = {
  id: string // pubkey,
  // price is in USD
  price: number
}

// V3 API returns direct object mapping, not wrapped in "data"
type Response = Record<string, PriceV3Response | null>

function* chunks<T>(arr: T[], n: number): Generator<T[], void> {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n)
  }
}

export const jupiterPriceQueryKeys = {
  all: ['Jupiter Price API'],
  byMint: (mint: PublicKey) => [...jupiterPriceQueryKeys.all, mint.toString()],
  byMints: (mints: PublicKey[]) => [
    ...jupiterPriceQueryKeys.all,
    mints.map((x) => x.toString()).sort(),
  ],
}

const jupQueryFn = async (mint: PublicKey) => {
  const x = await fetch(`${PRICE_URL}?ids=${mint?.toString()}`)
  const response = (await x.json()) as Response
  const priceData = response[mint.toString()]
  
  // Convert V3 response to internal format
  if (priceData && priceData.usdPrice !== undefined) {
    const result: Price = {
      id: mint.toString(),
      price: priceData.usdPrice,
    }
    return { found: true, result } as const
  }
  
  return { found: false, result: undefined } as const
}

export const useJupiterPriceByMintQuery = (mint: PublicKey | undefined) => {
  const enabled = mint !== undefined
  return useQuery({
    queryKey: enabled ? jupiterPriceQueryKeys.byMint(mint) : undefined,
    queryFn: async () => {
      if (!enabled) throw new Error()
      return jupQueryFn(mint)
    },
  })
}

export const fetchJupiterPrice = async (mint: PublicKey) =>
  queryClient.fetchQuery({
    queryKey: jupiterPriceQueryKeys.byMint(mint),
    queryFn: () => jupQueryFn(mint),
  })

/**
 * @deprecated
 * do not use this! it only exists to replace a previously existing synchronous function. use fetchJupiterPrice
 * */
export const getJupiterPriceSync = (mint: PublicKey) =>
  ((queryClient.getQueryData(jupiterPriceQueryKeys.byMint(mint)) as any)?.result
    ?.price as number) ?? 0

export const useJupiterPricesByMintsQuery = (mints: PublicKey[]) => {
  const enabled = mints.length > 0
  const deduped = new Set(mints)
  const dedupedMints = Array.from(deduped)

  return useQuery({
    enabled,
    queryKey: jupiterPriceQueryKeys.byMints(dedupedMints),
    queryFn: async () => {
      const batches = [...chunks(dedupedMints, 50)] // V3 limits to 50 ids per request
      const responses = await Promise.all(
        batches.map(async (batch) => {
          const x = await fetch(`${PRICE_URL}?ids=${batch.join(',')}`)
          const response = (await x.json()) as Response
          return response
        }),
      )
      
      // Merge all batch responses
      const mergedResponse = responses.reduce(
        (acc, next) => ({ ...acc, ...next }),
        {} as Response,
      )

      // Convert V3 response to internal Price format
      const data: Record<string, Price> = {}
      Object.entries(mergedResponse).forEach(([mintAddress, priceData]) => {
        if (priceData && priceData.usdPrice !== undefined) {
          data[mintAddress] = {
            id: mintAddress,
            price: priceData.usdPrice,
          }
        }
      })

      //override chai price if its broken
      const chaiMint = '3jsFX1tx2Z8ewmamiwSU851GzyzM2DJMq7KWW5DM8Py3'
      const chaiData = data[chaiMint]

      if (chaiData?.price && (chaiData.price > 1.3 || chaiData.price < 0.9)) {
        data[chaiMint] = {
          ...chaiData,
          price: 1,
        }
      }
      return data
    },
    onSuccess: (data) => {
      dedupedMints.forEach((mint) =>
        queryClient.setQueryData(
          jupiterPriceQueryKeys.byMint(mint),
          data[mint.toString()]
            ? ({ found: true, result: data[mint.toString()] } as const)
            : ({ found: false, result: undefined } as const),
        ),
      )
    },
  })
}

// function is used to get fresh token prices
export const getJupiterPricesByMintStrings = async (mints: string[]) => {
  if (mints.length === 0) return {}
  const deduped = new Set(mints)
  const dedupedMints = Array.from(deduped)
  try {
    // V3 limits to 50 ids per request
    const batches: string[][] = []
    for (let i = 0; i < dedupedMints.length; i += 50) {
      batches.push(dedupedMints.slice(i, i + 50))
    }

    const responses = await Promise.all(
      batches.map(async (batch) => {
        const x = await fetch(`${PRICE_URL}?ids=${batch.join(',')}`)
        return (await x.json()) as Response
      }),
    )

    // Merge all batch responses
    const mergedResponse = responses.reduce(
      (acc, next) => ({ ...acc, ...next }),
      {} as Response,
    )

    // Convert V3 response to internal Price format
    const data: Record<string, Price> = {}
    Object.entries(mergedResponse).forEach(([mintAddress, priceData]) => {
      if (priceData && priceData.usdPrice !== undefined) {
        data[mintAddress] = {
          id: mintAddress,
          price: priceData.usdPrice,
        }
      }
    })

    //override chai price if its broken
    const chaiMint = '3jsFX1tx2Z8ewmamiwSU851GzyzM2DJMq7KWW5DM8Py3'
    const chaiData = data[chaiMint]

    if (chaiData?.price && (chaiData.price > 1.3 || chaiData.price < 0.9)) {
      data[chaiMint] = {
        ...chaiData,
        price: 1,
      }
    }
    return data
  } catch (error) {
    console.error('Error fetching Jupiter prices:', error)
    throw error
  }
}

