import React, { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Wallet } from '@models/treasury/Wallet'
import { AssetType } from '@models/treasury/Asset'
import BigNumber from 'bignumber.js'

interface TokenData {
  name: string
  value: number
  holdingsUsd: number
  distribution: number
  color: string
}

interface Props {
  wallet: Wallet
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{
    payload: TokenData
  }>
}

const COLORS = ["#63C49D", "#79C8E7", "#F2D76B", "#BFACD0", "#D982F8"]

export default function SolanaBreakdownsV2(props: Props) {
  const { wallet } = props

  const tokenData = useMemo(() => {
    // Filter tokens and SOL from assets
    const tokens = wallet.assets.filter(
      (asset) => asset.type === AssetType.Token || asset.type === AssetType.Sol
    )

    // Aggregate tokens with the same symbol (specifically for JitoSOL)
    const aggregatedTokens = tokens.reduce((acc, token) => {
      // Use symbol as the identifier for grouping
      const key = token.type === AssetType.Token ? token.symbol : 'SOL'
      
      if (!acc[key]) {
        acc[key] = {
          ...token,
          value: token.value || new BigNumber(0),
          count: new BigNumber(token.count || 0)
        }
      } else {
        // Add values from tokens with same symbol
        acc[key].value = acc[key].value.plus(token.value || new BigNumber(0))
        if (token.count) {
          acc[key].count = acc[key].count.plus(token.count)
        }
      }
      return acc
    }, {} as Record<string, any>)

    // Calculate total value from aggregated tokens
    let totalValue = new BigNumber(0)
    Object.values(aggregatedTokens).forEach(token => {
      totalValue = totalValue.plus(token.value || new BigNumber(0))
    })

    if (totalValue.isZero()) {
      return []
    }

    // Map to chart data format
    let remaining = totalValue.toNumber()
    
    return Object.values(aggregatedTokens)
      .map(token => {
        const name = token.type === AssetType.Token ? token.symbol || 'Unknown' : 'SOL'
        const holdingsUsd = token.value?.toNumber() || 0
        const distribution = token.value?.div(totalValue).multipliedBy(100).toNumber() || 0
        
        return {
          name,
          value: holdingsUsd,
          holdingsUsd,
          distribution,
          rawValue: token.value || new BigNumber(0)
        }
      })
      .sort((a, b) => b.distribution - a.distribution)
      .filter(token => !token.rawValue.isZero())
      .map((token, index, array) => {
        // Combine small values into "Others" category
        if (index === 4 && array.length > 5) {
          remaining -= token.holdingsUsd
          return {
            name: 'Others',
            value: remaining,
            holdingsUsd: remaining,
            distribution: (remaining / totalValue.toNumber()) * 100,
            color: COLORS[4]
          }
        }
        
        remaining -= token.holdingsUsd
        return {
          ...token,
          color: COLORS[index % COLORS.length]
        }
      })
      .slice(0, 5)
  }, [wallet.assets])

  const formatCurrency = (value: number) => {
    if (!value && value !== 0) return '$0.00'
    
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}k`
    }
    return `$${value.toFixed(2)}`
  }

  const formatPercent = (value: number) => {
    if (!value && value !== 0) return '0.00%'
    return `${value.toFixed(2)}%`
  }

  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload
      return (
        <div className="bg-bkg-1 p-2 rounded-md border border-bkg-4">
          <p className="font-bold">{data.name}</p>
          <p>Value: {formatCurrency(data.holdingsUsd)}</p>
          <p>Distribution: {formatPercent(data.distribution)}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="py-8">
      <header className="mb-6">
        <div className="text-fgd-1 text-lg font-bold">Token Breakdown</div>
        <div className="text-fgd-3 text-sm">Tokens that have value greater than $0 are being displayed.</div>
      </header>

      <div className="flex flex-col lg:flex-row justify-between">
        <div className="w-full lg:w-1/2 h-64">
          {tokenData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tokenData}
                  cx="50%"
                  cy="50%"
                  innerRadius="60%"
                  outerRadius="80%"
                  paddingAngle={0}
                  dataKey="value"
                  stroke="none"
                  strokeWidth={0}
                >
                  {tokenData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color} 
                      stroke="none" 
                      strokeWidth={0}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-fgd-3">
              No tokens of dollar value found in this wallet.
            </div>
          )}
        </div>

        <div className="w-full lg:w-1/2 mt-4 lg:mt-0">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-4 mb-2 text-sm text-fgd-3">
            <div></div>
            <div>ASSET</div>
            <div className="text-right">VALUE</div>
            <div className="text-right">DISTRIBUTION</div>
          </div>
          
          {tokenData.map((token, index) => (
            <div key={index} className="text-sm grid grid-cols-[auto_1fr_1fr_1fr] gap-4 py-2 border-t border-bkg-4 items-center">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: token.color }}
              ></div>
              <div className="font-medium">{token.name}</div>
              <div className="text-right">{formatCurrency(token.holdingsUsd)}</div>
              <div className="text-right">{formatPercent(token.distribution)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
