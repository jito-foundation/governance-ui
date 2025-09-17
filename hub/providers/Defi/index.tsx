import { BigNumber } from 'bignumber.js';
import { createContext } from 'react';

import useTreasuryInfo from '@hooks/useTreasuryInfo';
import { Status } from '@hub/types/Result';

import {
  useSavePlans,
} from './plans/save';

export type DefiType = 'Staking' | 'Lending';

export type Position = {
  planId: string;
  amount: BigNumber;
  accountAddress?: string;
  earnings?: BigNumber;
  walletAddress: string;
  new?: boolean;
  value: BigNumber;
};
export type Plan = {
  id: string;
  assets: {
    symbol: string;
    mintAddress: string;
    logo: string;
    decimals: number;
  }[];
  price?: number;
  apr: number;
  name: string;
  protocol: string;
  type: DefiType;
  deposit: (amount: number, realmsWalletAddress: string) => void;
};

export function aggregateStats(plans: Plan[], positions: Position[]) {
  const plansMap = new Map(plans.map((plan) => [plan.id, plan]));
  const totalDepositedUsd = positions.reduce(
    (acc, position) =>
      acc.plus(
        position.amount.times(plansMap.get(position.planId)?.price ?? 0),
      ),
    new BigNumber(0),
  );
  const averageApr = totalDepositedUsd.isZero()
    ? new BigNumber(0)
    : plans
        .reduce((acc, plan) => {
          const totalDepositedUsdInPlan = positions
            .filter((p) => p.planId === plan.id)
            .reduce(
              (acc, position) =>
                acc.plus(
                  position.amount.times(
                    plansMap.get(position.planId)?.price ?? 0,
                  ),
                ),
              new BigNumber(0),
            );
          return acc.plus(totalDepositedUsdInPlan.times(plan.apr));
        }, new BigNumber(0))
        .dividedBy(totalDepositedUsd);
  const totalEarnings = positions.reduce(
    (acc, position) =>
      acc
        .plus(position.earnings ?? 0)
        .times(plansMap.get(position.planId)?.price ?? 0),
    new BigNumber(0),
  );

  return {
    totalDepositedUsd,
    averageApr,
    totalEarnings,
  };
}

interface Value {
  plans: Plan[];
  positions: Position[];
  indicatorTokens: string[];
}

export const DEFAULT: Value = {
  plans: [],
  positions: [],
  indicatorTokens: [],
};

export const context = createContext(DEFAULT);

interface Props {
  children?: React.ReactNode;
}

export function DefiProvider(props: Props) {
  const data = useTreasuryInfo();
  const loadedData = data._tag === Status.Ok ? data.data : null;
  const { plans: savePlans, positions: savePositions, indicatorTokens } = useSavePlans(
    loadedData?.wallets,
  );

  return (
    <context.Provider
      value={{
        plans: [...savePlans],
        positions: [...savePositions],
        indicatorTokens,
      }}
    >
      {props.children}
    </context.Provider>
  );
}
