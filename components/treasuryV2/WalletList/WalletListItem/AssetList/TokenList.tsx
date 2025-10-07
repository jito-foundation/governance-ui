import React, { useMemo } from 'react'
import cx from 'classnames'

import { AssetType, Token, Sol } from '@models/treasury/Asset'

import Collapsible from './Collapsible'
import TokenIcon from '../../../icons/TokenIcon'
import TokenListItem from './TokenListItem'

interface Props {
  className?: string
  disableCollapse?: boolean
  expanded?: boolean
  tokens: (Token | Sol)[]
  selectedAssetId?: string | null
  onSelect?(token: Token | Sol): void
  onToggleExpand?(): void
}

export default function TokenList(props: Props) {
  const tokens = useMemo(() => {
    return props.tokens.sort((a, b) => {
      const aHasValue = a.value.isGreaterThan(0)
      const bHasValue = b.value.isGreaterThan(0)

      // Tokens with value come first
      if (aHasValue && !bHasValue) return -1
      if (!aHasValue && bHasValue) return 1

      // Both have value: sort by highest value
      if (aHasValue && bHasValue) {
        return b.value.comparedTo(a.value)
      }

      // Neither has value: sort by count
      return b.count.comparedTo(a.count)
    })
  }, [props?.tokens])

  const expandCutoff = useMemo(() => {
    return Math.max(
      tokens.findIndex((token) => token.value.isEqualTo(0)),
      3,
    )
  }, [tokens])

  return (
    <Collapsible
      className={cx(props.className)}
      count={props.tokens.length}
      disableCollapse={props.disableCollapse}
      expanded={props.expanded}
      expandCutoff={expandCutoff}
      icon={<TokenIcon className="fill-white/50" />}
      title="Tokens"
      onToggleExpand={props.onToggleExpand}
    >
      {tokens.map((token, i) => (
        <TokenListItem
          amount={token.count}
          key={i}
          name={token.type === AssetType.Sol ? 'Solana' : token.name}
          price={token.price}
          symbol={token.type === AssetType.Sol ? 'SOL' : token.symbol}
          thumbnail={token.icon}
          selected={props.selectedAssetId === token.id}
          onSelect={() => props.onSelect?.(token)}
        />
      ))}
    </Collapsible>
  )
}
