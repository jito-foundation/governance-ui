import { Client } from '@solana/governance-program-library'
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import BN from 'bn.js'
import { StakeAccount, StakeConnection } from '@parcl-oss/staking'
import { Provider, Wallet } from '@coral-xyz/anchor'
import { VoterWeightAction } from '@solana/spl-governance'
import { convertVoterWeightActionToType } from '../VoterWeightPlugins/lib/utils'
import queryClient from '@hooks/queries/queryClient'

// A wrapper for the StakeConnection from @parcl-oss/staking, that implements the generic plugin client interface
export class ParclVoterWeightPluginClient extends Client<any> {
  readonly requiresInputVoterWeight = false
  // The parcl plugin does not have a registrar account
  async getRegistrarAccount(): Promise<null> {
    return null
  }

  async getMaxVoterWeightRecordPDA() {
    const maxVoterWeightPk = (
      await this.client.program.methods.updateMaxVoterWeight().pubkeys()
    ).maxVoterRecord

    if (!maxVoterWeightPk) return null

    return {
      maxVoterWeightPk,
      maxVoterWeightRecordBump: 0, // This is wrong for Parcl - but it doesn't matter as it is not used
    }
  }

  async getVoterWeightRecordPDA(
    realm: PublicKey,
    mint: PublicKey,
    voter: PublicKey,
  ) {
    const { voterWeightAccount } = await this.getUpdateVoterWeightPks(
      [],
      voter,
      VoterWeightAction.CastVote,
      PublicKey.default,
    )

    return {
      voterWeightPk: voterWeightAccount,
      voterWeightRecordBump: 0, // This is wrong for Parcl - but it doesn't matter as it is not used
    }
  }

  // NO-OP Parcl records are created through the Parcl dApp.
  async createVoterWeightRecord(): Promise<TransactionInstruction | null> {
    return null
  }

  // NO-OP
  async createMaxVoterWeightRecord(): Promise<TransactionInstruction | null> {
    return null
  }

  private async getStakeAccount(
    voter: PublicKey,
  ): Promise<StakeAccount | null> {
    return queryClient.fetchQuery({
      queryKey: ['parcl getStakeAccount', voter],
      queryFn: async () => {
        const account = await this.client.getMainAccount(voter)
        return account !== undefined ? account : null
      },
    })
  }

  private async getUpdateVoterWeightPks(
    instructions: TransactionInstruction[],
    voter: PublicKey,
    action: VoterWeightAction,
    target?: PublicKey,
  ) {
    const stakeAccount = await this.getStakeAccount(voter)

    if (!stakeAccount)
      throw new Error('Stake account not found for voter ' + voter.toString())
    return this.client.withUpdateVoterWeight(
      instructions,
      stakeAccount,
      { [convertVoterWeightActionToType(action)]: {} } as any,
      target,
    )
  }

  async updateVoterWeightRecord(
    voter: PublicKey,
    realm: PublicKey,
    mint: PublicKey,
    action: VoterWeightAction,
    inputRecordCallback?: () => Promise<PublicKey>,
    target?: PublicKey,
  ) {
    const instructions: TransactionInstruction[] = []
    await this.getUpdateVoterWeightPks(instructions, voter, action, target)

    return { pre: instructions }
  }
  // NO-OP
  async updateMaxVoterWeightRecord(): Promise<TransactionInstruction | null> {
    return null
  }
  async calculateVoterWeight(voter: PublicKey): Promise<BN | null> {
    const stakeAccount = await this.getStakeAccount(voter)

    if (stakeAccount) {
      return stakeAccount.getVoterWeight(await this.client.getTime()).toBN()
    } else {
      return new BN(0)
    }
  }
  constructor(
    program: typeof StakeConnection.prototype.program,
    private client: StakeConnection,
    devnet: boolean,
  ) {
    super(program, devnet)
  }

  static async connect(
    provider: Provider,
    devnet = false,
    wallet: Wallet,
  ): Promise<ParclVoterWeightPluginClient> {
    const parclClient = await StakeConnection.connect(
      provider.connection,
      wallet,
    )

    return new ParclVoterWeightPluginClient(
      parclClient.program,
      parclClient,
      devnet,
    )
  }
}
