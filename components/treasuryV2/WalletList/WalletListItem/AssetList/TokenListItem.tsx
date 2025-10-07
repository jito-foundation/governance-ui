import React, { useMemo } from 'react'
import type { BigNumber } from 'bignumber.js'
import cx from 'classnames'

import { formatNumber } from '@utils/formatNumber'

import ListItem from './ListItem'

interface Props {
  className?: string
  amount: BigNumber
  name: string
  price?: BigNumber
  selected?: boolean
  symbol: string
  thumbnail: JSX.Element
  onSelect?(): void
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F-\u009F]/g

export default function TokenListItem(props: Props) {
  const sanitizedSymbol = useMemo(() => {
    return props.symbol?.replace(CONTROL_CHARS_REGEX, '').trim() || ''
  }, [props.symbol])

  return (
    <ListItem
      className={props.className}
      name={props.name}
      rhs={
        <div className="flex items-end flex-col">
          <div className="flex items-center space-x-1 text-right">
            <div className="text-xs text-fgd-1 font-bold">
              {props.amount.isLessThan(0)
                ? formatNumber(props.amount, undefined, {})
                : props.amount.isInteger()
                ? formatNumber(props.amount, undefined, {
                    maximumFractionDigits: 0,
                  })
                : formatNumber(props.amount)}
            </div>
            <div className="text-xs text-fgd-1 text-right">
              {sanitizedSymbol}
            </div>
          </div>
          {!!props.price && (
            <div className="text-xs text-white/50">
              ${formatNumber(props.amount.multipliedBy(props.price))}
            </div>
          )}
        </div>
      }
      selected={props.selected}
      thumbnail={React.cloneElement(props.thumbnail, {
        className: cx(
          props.thumbnail.props.className,
          'h-6',
          'fill-fgd-1',
          'w-6',
        ),
      })}
      onSelect={props.onSelect}
    />
  )
}
