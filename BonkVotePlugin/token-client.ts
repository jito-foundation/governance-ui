import { Provider, BN, Program } from '@coral-xyz/anchor'
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import tokenIdl from './token-idl.json'
import { Client } from '@solana/governance-program-library'
import { fetchRealmByPubkey } from '@hooks/queries/realm'
import { TokenVoter } from './token-type'
import { tokenVoterKey } from './utils'
import { VoterWeightAction } from '@solana/spl-governance'
import { TOKEN_VOTER_PK } from '@constants/plugins'

export class TokenVoterClient extends Client<TokenVoter> {
  readonly requiresInputVoterWeight = true

  constructor(public program: Program<TokenVoter>) {
    super(program)
  }

  async calculateMaxVoterWeight(
    _realm: PublicKey,
    _mint: PublicKey,
  ): Promise<BN | null> {
    const { result: realm } = await fetchRealmByPubkey(
      this.program.provider.connection,
      _realm,
    )

    return realm?.account.config?.communityMintMaxVoteWeightSource.value ?? null // TODO this code should not actually be called because this is not a max voter weight plugin
  }

  async calculateVoterWeight(
    voter: PublicKey,
    realm: PublicKey,
    mint: PublicKey,
  ): Promise<BN | null> {
    try {
      const tokenVoterAddress = tokenVoterKey(
        realm,
        mint,
        voter,
        this.program.programId,
      )[0]
      const tokenVoterAccount =
        await this.program.account.voter.fetch(tokenVoterAddress)
      const depositedTokens =
        tokenVoterAccount.deposits[0].amountDepositedNative
      return depositedTokens
    } catch (e) {
      console.log(e)
      return null
    }
  }

  async updateVoterWeightRecord(
    voter: PublicKey,
    realm: PublicKey,
    mint: PublicKey,
    action?: VoterWeightAction,
    //inputRecordCallback?: (() => Promise<PublicKey>) | undefined
  ): Promise<{
    pre: TransactionInstruction[]
    post?: TransactionInstruction[] | undefined
  }> {
    return { pre: [] }
  }

  // NO-OP
  async createMaxVoterWeightRecord(): Promise<TransactionInstruction | null> {
    return null
  }

  // NO-OP
  async updateMaxVoterWeightRecord(): Promise<TransactionInstruction | null> {
    return null
  }

  static async connect(
    provider: Provider,
    programId = new PublicKey(TOKEN_VOTER_PK[0]),
  ) {
    const DEFAULT_TOKEN_VOTER_PROGRAMID = new PublicKey(
      'HA99cuBQCCzZu1zuHN2qBxo2FBo1cxNLwKkdt6Prhy8v',
    )
    return new TokenVoterClient(
      new Program<TokenVoter>(tokenIdl as TokenVoter, programId, provider),
    )
  }

  async createVoterWeightRecord(
    voter: PublicKey,
    realm: PublicKey,
    mint: PublicKey,
  ): Promise<TransactionInstruction | null> {
    return null
  }
}
