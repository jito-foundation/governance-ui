import { serializeInstructionToBase64 } from '@solana/spl-governance'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from '@solana/spl-token'
import { createMintToInstruction } from '@solana/spl-token-new'
import { WalletAdapter } from '@solana/wallet-adapter-base'
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { Marinade, MarinadeConfig } from '@marinade.finance/marinade-ts-sdk'
import {
  getMintNaturalAmountFromDecimal,
  parseMintNaturalAmountFromDecimal,
} from '@tools/sdk/units'
import {
  getStakePoolAccount,
  STAKE_POOL_PROGRAM_ID,
} from '@solana/spl-stake-pool'
import { ConnectionContext } from 'utils/connection'
import { getATA } from './ataTools'
import { isBatchFormValid, isFormValid } from './formValidation'
import { UiInstruction } from './uiTypes/proposalCreationTypes'
import { AssetAccount } from '@utils/uiTypes/assets'
import {
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
} from '@metaplex-foundation/mpl-token-metadata'
import { findMetadataPda } from '@metaplex-foundation/js'
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token-new'
import { JITO_STAKE_POOL_ACCOUNT, JITOSOL_MINT_ADDRESS } from '../components/TreasuryAccount/ConvertToJitoSol'

export const validateInstruction = async ({
  schema,
  form,
  setFormErrors,
}): Promise<boolean> => {
  const { isValid, validationErrors } = await isFormValid(schema, form)
  setFormErrors(validationErrors)
  return isValid
}

export const validateBatchInstruction = async ({
  schema,
  form,
  setFormErrors,
}): Promise<boolean> => {
  const { isValid, validationErrors } = await isBatchFormValid(schema, form)
  setFormErrors(validationErrors)
  return isValid
}

/** @deprecated */
export async function getTransferInstruction({
  schema,
  form,
  programId,
  connection,
  wallet,
  currentAccount,
  setFormErrors,
}: {
  schema: any
  form: any
  programId: PublicKey | undefined
  connection: ConnectionContext
  wallet: WalletAdapter | undefined
  currentAccount: AssetAccount | null
  setFormErrors: any
}): Promise<UiInstruction> {
  let isValid = await validateInstruction({ schema, form, setFormErrors })
  let serializedInstruction = ''
  const prerequisiteInstructions: TransactionInstruction[] = []
  const governedTokenAccount = form.governedTokenAccount as AssetAccount
  if (
    isValid &&
    programId &&
    governedTokenAccount.extensions?.token?.publicKey &&
    governedTokenAccount.extensions?.token &&
    governedTokenAccount.extensions?.mint?.account
  ) {
    const sourceAccount = governedTokenAccount.extensions.transferAddress
    const isToken2022 = currentAccount?.extensions.token?.account.isToken2022
    //this is the original owner
    const destinationAccount = new PublicKey(form.destinationAccount)
    const mintPK = form.governedTokenAccount.extensions.mint.publicKey
    const mintAmount = parseMintNaturalAmountFromDecimal(
      form.amount!,
      governedTokenAccount.extensions.mint.account.decimals,
    )

    const receiverAccount =
      await connection.current.getAccountInfo(destinationAccount)
    const isSolWallet = receiverAccount?.owner.equals(PublicKey.default)
    const ataAddress = isSolWallet
      ? getAssociatedTokenAddressSync(
          mintPK, // mint
          destinationAccount, // owner
          true,
          isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
        )
      : destinationAccount
    const ataAccountData = await connection.current.getAccountInfo(ataAddress)
    const isAtaExist = ataAccountData?.owner.equals(TOKEN_PROGRAM_ID) 
      || ataAccountData?.owner.equals(TOKEN_2022_PROGRAM_ID)  

    if (!receiverAccount) {
      setFormErrors({
        amount: '',
        destinationAccount: 'The provided destination account is a new account. Kindly fund this account.'
      })
      isValid = false
    }
      
    //we push this createATA instruction to transactions to create right before creating proposal
    //we don't want to create ata only when instruction is serialized
    if (!isAtaExist) {
      prerequisiteInstructions.push(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID, // always ASSOCIATED_TOKEN_PROGRAM_ID
          isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
          mintPK, // mint
          ataAddress, // ata
          destinationAccount, // owner of token account
          wallet!.publicKey!, // fee payer
        ),
      )
    }

    const transferIx = isToken2022
      ? createTransferCheckedInstruction(
          sourceAccount!,
          currentAccount!.extensions.mint!.publicKey!,
          ataAddress,
          currentAccount!.extensions!.token!.account.owner,
          mintAmount,
          currentAccount!.extensions.mint!.account.decimals!,
          [],
          isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
        )
      : Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          sourceAccount!,
          ataAddress,
          currentAccount!.extensions!.token!.account.owner,
          [],
          new u64(mintAmount.toString()),
        )

    serializedInstruction = serializeInstructionToBase64(transferIx)
  }

  const obj: UiInstruction = {
    serializedInstruction,
    isValid,
    governance: currentAccount?.governance,
    prerequisiteInstructions: prerequisiteInstructions,
    chunkBy: 4,
  }
  return obj
}

/** @deprecated */
export async function getBatchTransferInstruction({
  schema,
  form,
  programId,
  connection,
  wallet,
  currentAccount,
  setFormErrors,
}: {
  schema: any
  form: any
  programId: PublicKey | undefined
  connection: ConnectionContext
  wallet: WalletAdapter | undefined
  currentAccount: AssetAccount | null
  setFormErrors: any
}): Promise<UiInstruction[]> {
  let isValid = await validateBatchInstruction({
    schema,
    form,
    setFormErrors,
  })

  const ixs: {
    serializedInstruction: string
    prerequisiteInstructions: TransactionInstruction[]
  }[] = []

  for (let i = 0; i < form.destinationAccount.length; i++) {
    let serializedInstruction = ''
    const prerequisiteInstructions: TransactionInstruction[] = []
    const governedTokenAccount = form.governedTokenAccount as AssetAccount
    if (
      isValid &&
      programId &&
      governedTokenAccount.extensions?.token?.publicKey &&
      governedTokenAccount.extensions?.token &&
      governedTokenAccount.extensions?.mint?.account
    ) {
      const sourceAccount = governedTokenAccount.extensions.transferAddress
      //this is the original owner
      const isToken2022 = currentAccount?.extensions.token?.account.isToken2022
      const destinationAccount = new PublicKey(form.destinationAccount[i])
      const mintPK = form.governedTokenAccount.extensions.mint.publicKey
      const mintAmount = parseMintNaturalAmountFromDecimal(
        form.amount[i]!,
        governedTokenAccount.extensions.mint.account.decimals,
      )

      const receiverAccount =
      await connection.current.getAccountInfo(destinationAccount)
      const isSolWallet = receiverAccount?.owner.equals(PublicKey.default)
      const ataAddress = isSolWallet
        ? getAssociatedTokenAddressSync(
            mintPK, // mint
            destinationAccount, // owner
            true,
            isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
          )
        : destinationAccount
      const ataAccountData = await connection.current.getAccountInfo(ataAddress)
      const isAtaExist = ataAccountData?.owner.equals(TOKEN_PROGRAM_ID) 
        || ataAccountData?.owner.equals(TOKEN_2022_PROGRAM_ID)  

      if (!receiverAccount) {
        const errors = {
          amount: form.destinationAccount.map(_ => ''),
          destinationAccount: form.destinationAccount.map(_ => '')
        }
        errors.destinationAccount[i] = 'The provided destination account is a new account. Kindly fund this account.'
        setFormErrors(errors)
        isValid = false
      }

      //we push this createATA instruction to transactions to create right before creating proposal
      //we don't want to create ata only when instruction is serialized
      if (!isAtaExist) {
        prerequisiteInstructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID, // always ASSOCIATED_TOKEN_PROGRAM_ID
            isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
            mintPK, // mint
            ataAddress, // ata
            destinationAccount, // owner of token account
            wallet!.publicKey!, // fee payer
          ),
        )
      }

      const transferIx = isToken2022
        ? createTransferCheckedInstruction(
            sourceAccount!,
            currentAccount!.extensions.mint!.publicKey!,
            ataAddress,
            currentAccount!.extensions!.token!.account.owner,
            mintAmount,
            currentAccount!.extensions.mint!.account.decimals!,
            [],
            isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
          )
        : Token.createTransferInstruction(
            TOKEN_PROGRAM_ID,
            sourceAccount!,
            ataAddress,
            currentAccount!.extensions!.token!.account.owner,
            [],
            new u64(mintAmount.toString()),
          )

      serializedInstruction = serializeInstructionToBase64(transferIx)
    }
    ixs.push({ serializedInstruction, prerequisiteInstructions })
  }

  const obj: UiInstruction[] = ixs.map((ix) => ({
    serializedInstruction: ix.serializedInstruction,
    isValid,
    governance: currentAccount?.governance,
    prerequisiteInstructions: ix.prerequisiteInstructions,
    chunkBy: 4,
  }))

  return obj
}

export async function getSolTransferInstruction({
  schema,
  form,
  programId,
  currentAccount,
  setFormErrors,
}: {
  schema: any
  form: any
  programId: PublicKey | undefined
  connection: ConnectionContext
  wallet: WalletAdapter | undefined
  currentAccount: AssetAccount | null
  setFormErrors: any
}): Promise<UiInstruction> {
  const isValid = await validateInstruction({ schema, form, setFormErrors })
  let serializedInstruction = ''
  const prerequisiteInstructions: TransactionInstruction[] = []
  const governedTokenAccount = form.governedTokenAccount as AssetAccount
  if (isValid && programId && governedTokenAccount?.extensions.mint?.account) {
    const sourceAccount = governedTokenAccount.extensions.transferAddress
    const destinationAccount = new PublicKey(form.destinationAccount)
    //We have configured mint that has same decimals settings as SOL
    const mintAmount = parseMintNaturalAmountFromDecimal(
      form.amount!,
      governedTokenAccount.extensions.mint.account.decimals,
    )

    const transferIx = SystemProgram.transfer({
      fromPubkey: sourceAccount!,
      toPubkey: destinationAccount,
      lamports: mintAmount,
    })
    serializedInstruction = serializeInstructionToBase64(transferIx)
  }
  const obj: UiInstruction = {
    serializedInstruction,
    isValid,
    governance: currentAccount?.governance,
    prerequisiteInstructions: prerequisiteInstructions,
    chunkBy: 4,
  }
  return obj
}

export async function getBatchSolTransferInstruction({
  schema,
  form,
  programId,
  currentAccount,
  setFormErrors,
}: {
  schema: any
  form: any
  programId: PublicKey | undefined
  connection: ConnectionContext
  wallet: WalletAdapter | undefined
  currentAccount: AssetAccount | null
  setFormErrors: any
}): Promise<UiInstruction[]> {
  const isValid = await validateBatchInstruction({
    schema,
    form,
    setFormErrors,
  })

  const ixs: {
    serializedInstruction: string
    prerequisiteInstructions: TransactionInstruction[]
  }[] = []

  for (let i = 0; i < form.destinationAccount.length; i++) {
    let serializedInstruction = ''
    const prerequisiteInstructions: TransactionInstruction[] = []
    const governedTokenAccount = form.governedTokenAccount as AssetAccount
    if (
      isValid &&
      programId &&
      governedTokenAccount?.extensions.mint?.account
    ) {
      const sourceAccount = governedTokenAccount.extensions.transferAddress
      const destinationAccount = new PublicKey(form.destinationAccount[i])
      //We have configured mint that has same decimals settings as SOL
      const mintAmount = parseMintNaturalAmountFromDecimal(
        form.amount[i]!,
        governedTokenAccount.extensions.mint.account.decimals,
      )

      const transferIx = SystemProgram.transfer({
        fromPubkey: sourceAccount!,
        toPubkey: destinationAccount,
        lamports: mintAmount,
      })
      serializedInstruction = serializeInstructionToBase64(transferIx)
    }

    ixs.push({ serializedInstruction, prerequisiteInstructions })
  }

  const obj: UiInstruction[] = ixs.map((ix) => ({
    serializedInstruction: ix.serializedInstruction,
    isValid,
    governance: currentAccount?.governance,
    prerequisiteInstructions: ix.prerequisiteInstructions,
    chunkBy: 4,
  }))

  return obj
}

export async function getMintInstruction({
  schema,
  form,
  programId,
  connection,
  wallet,
  governedMintInfoAccount,
  setFormErrors,
}: {
  schema: any
  form: any
  programId: PublicKey | undefined
  connection: ConnectionContext
  wallet: WalletAdapter | undefined
  governedMintInfoAccount: AssetAccount | undefined
  setFormErrors: any
}): Promise<UiInstruction> {
  const isValid = await validateInstruction({ schema, form, setFormErrors })
  let serializedInstruction = ''
  const prerequisiteInstructions: TransactionInstruction[] = []
  if (isValid && programId && form.mintAccount?.governance?.pubkey) {
    //this is the original owner
    const destinationAccount = new PublicKey(form.destinationAccount)

    const mintPK = form.mintAccount.extensions.mint!.publicKey
    const mintAmount = parseMintNaturalAmountFromDecimal(
      form.amount!,
      form.mintAccount.extensions.mint.account?.decimals,
    )

    //we find true receiver address if its wallet and we need to create ATA the ata address will be the receiver
    const { currentAddress: receiverAddress, needToCreateAta } = await getATA({
      connection,
      receiverAddress: destinationAccount,
      mintPK,
      wallet: wallet!,
    })
    //we push this createATA instruction to transactions to create right before creating proposal
    //we don't want to create ata only when instruction is serialized
    if (needToCreateAta) {
      prerequisiteInstructions.push(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID, // always ASSOCIATED_TOKEN_PROGRAM_ID
          TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
          mintPK, // mint
          receiverAddress, // ata
          destinationAccount, // owner of token account
          wallet!.publicKey!, // fee payer
        ),
      )
    }
    const transferIx = createMintToInstruction(
      mintPK,
      receiverAddress,
      form.mintAccount.extensions.mint!.account.mintAuthority!,
      BigInt(mintAmount.toString()),
      undefined, TOKEN_PROGRAM_ID
    )
    serializedInstruction = serializeInstructionToBase64(transferIx)
  }
  const obj: UiInstruction = {
    serializedInstruction,
    isValid,
    governance: governedMintInfoAccount?.governance,
    prerequisiteInstructions: prerequisiteInstructions,
  }
  return obj
}

export async function getConvertToJitoSolInstruction({
  schema,
  form,
  connection,
  wallet,
  setFormErrors,
}: {
  schema: any
  form: any
  connection: ConnectionContext
  wallet: WalletAdapter | undefined
  setFormErrors: any
}): Promise<UiInstruction> {
  const isValid = await validateInstruction({ schema, form, setFormErrors })
  const prerequisiteInstructions: TransactionInstruction[] = []
  let serializedInstruction = ''

  if (isValid && form?.governedTokenAccount?.extensions?.transferAddress) {
    const amount = getMintNaturalAmountFromDecimal(
      form.amount,
      form.governedTokenAccount.extensions.mint.account.decimals,
    )
    const originAccount = form.governedTokenAccount.extensions.transferAddress

    let destinationTokenAccount: PublicKey | undefined

    if (form.destinationAccount) {
      destinationTokenAccount = form.destinationAccount.pubkey
    } else {
      const { currentAddress: jitoSolAta, needToCreateAta } = await getATA({
        connection: connection,
        receiverAddress: originAccount,
        mintPK: JITOSOL_MINT_ADDRESS,
        wallet,
      })
      destinationTokenAccount = jitoSolAta
      
      if (needToCreateAta && wallet?.publicKey) {
        prerequisiteInstructions.push(
          createAssociatedTokenAccountIdempotentInstruction(
            wallet.publicKey, // payer
            destinationTokenAccount, // ata
            originAccount, // owner
            JITOSOL_MINT_ADDRESS, // mint
          ),
        )
      }
    }

    try {
      const stakePoolAccount = await getStakePoolAccount(
        connection.current,
        JITO_STAKE_POOL_ACCOUNT,
      )

      if (!stakePoolAccount) {
        throw new Error('Failed to get stake pool account data')
      }

      const [withdrawAuthority] = PublicKey.findProgramAddressSync(
        [JITO_STAKE_POOL_ACCOUNT.toBuffer(), Buffer.from('withdraw')],
        STAKE_POOL_PROGRAM_ID,
      )

      // Note: Using governance account directly as funding account (no ephemeral transfer like in spl stake pool library)
      const keys = [
        { pubkey: JITO_STAKE_POOL_ACCOUNT, isSigner: false, isWritable: true },
        { pubkey: withdrawAuthority, isSigner: false, isWritable: false },
        { pubkey: stakePoolAccount.account.data.reserveStake, isSigner: false, isWritable: true },
        { pubkey: originAccount, isSigner: true, isWritable: true }, // governance account as funding
        { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
        { pubkey: stakePoolAccount.account.data.managerFeeAccount, isSigner: false, isWritable: true },
        { pubkey: destinationTokenAccount, isSigner: false, isWritable: true }, 
        { pubkey: stakePoolAccount.account.data.poolMint, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ]

      // Create instruction data: 1 byte for instruction index (14) + 8 bytes for lamports
      const instructionData = Buffer.alloc(9)
      instructionData.writeUInt8(14, 0) // DepositSol instruction index
      instructionData.writeBigInt64LE(BigInt(amount), 1) // lamports amount

      const depositSolInstruction = new TransactionInstruction({
        programId: STAKE_POOL_PROGRAM_ID,
        keys,
        data: instructionData,
      })

      serializedInstruction = serializeInstructionToBase64(depositSolInstruction)
    } catch (error) {
      console.error('Error creating JitoSOL deposit instructions:', error)
      throw Error(`Failed to create JitoSOL deposit instructions: ${error}`)
    }
  }

  const obj: UiInstruction = {
    serializedInstruction,
    isValid,
    governance: form.governedTokenAccount?.governance,
    prerequisiteInstructions: prerequisiteInstructions,
  }

  return obj
}

export async function getConvertToMsolInstruction({
  schema,
  form,
  connection,
  wallet,
  setFormErrors,
}: {
  schema: any
  form: any
  connection: ConnectionContext
  wallet: WalletAdapter | undefined
  setFormErrors: any
}): Promise<UiInstruction> {
  const isValid = await validateInstruction({ schema, form, setFormErrors })
  const prerequisiteInstructions: TransactionInstruction[] = []
  let serializedInstruction = ''

  if (isValid && form.governedTokenAccount.extensions.transferAddress) {
    const amount = getMintNaturalAmountFromDecimal(
      form.amount,
      form.governedTokenAccount.extensions.mint.account.decimals,
    )
    const originAccount = form.governedTokenAccount.extensions.transferAddress
    let destinationAccountOwner: PublicKey
    const mSolMint = new PublicKey(
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    )

    const config = new MarinadeConfig({
      connection: connection.current,
      publicKey: originAccount,
    })
    const marinade = new Marinade(config)

    if (form.destinationAccount) {
      const destinationAccount = form.destinationAccount.pubkey

      const mSolToken = new Token(
        connection.current,
        mSolMint,
        TOKEN_PROGRAM_ID,
        null as unknown as Keypair,
      )

      const destinationAccountInfo =
        await mSolToken.getAccountInfo(destinationAccount)
      destinationAccountOwner = destinationAccountInfo.owner
    } else {
      destinationAccountOwner = originAccount
      const { currentAddress: destinationAccount, needToCreateAta } =
        await getATA({
          connection: connection,
          receiverAddress: originAccount,
          mintPK: mSolMint,
          wallet,
        })
      if (needToCreateAta && wallet?.publicKey) {
        prerequisiteInstructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            mSolMint,
            destinationAccount,
            originAccount,
            wallet.publicKey,
          ),
        )
      }
    }

    const { transaction } = await marinade.deposit(new BN(amount), {
      mintToOwnerAddress: destinationAccountOwner,
    })
    console.log('transaction', transaction)

    if (transaction.instructions.length === 1) {
      serializedInstruction = serializeInstructionToBase64(
        transaction.instructions[0],
      )
    } else if (transaction.instructions.length === 2) {
      serializedInstruction = serializeInstructionToBase64(
        transaction.instructions[1],
      )
    } else {
      throw Error(
        "Marinade's stake instructions could not be calculated correctly.",
      )
    }
  }

  const obj: UiInstruction = {
    serializedInstruction,
    isValid,
    governance: form.governedTokenAccount?.governance,
    prerequisiteInstructions: prerequisiteInstructions,
  }

  return obj
}

export async function getCreateTokenMetadataInstruction({
  schema,
  form,
  programId,
  connection,
  wallet,
  governedMintInfoAccount,
  setFormErrors,
  mintAuthority,
  payerSolTreasury,
  shouldMakeSolTreasury,
}: {
  schema: any
  form: any
  programId: PublicKey | undefined
  connection: ConnectionContext
  wallet: WalletAdapter | undefined
  governedMintInfoAccount: AssetAccount | undefined
  setFormErrors: any
  mintAuthority: PublicKey | null | undefined
  payerSolTreasury: PublicKey | null | undefined
  shouldMakeSolTreasury: boolean
}): Promise<UiInstruction> {
  const isValid = await validateInstruction({ schema, form, setFormErrors })
  let serializedInstruction = ''
  const prerequisiteInstructions: TransactionInstruction[] = []

  let payer = payerSolTreasury

  if (!payer && shouldMakeSolTreasury && governedMintInfoAccount) {
    payer = governedMintInfoAccount.governance.nativeTreasuryAddress
  }

  if (
    isValid &&
    programId &&
    form.mintAccount?.pubkey &&
    mintAuthority &&
    payer &&
    wallet
  ) {
    const metadataPDA = await findMetadataPda(form.mintAccount?.pubkey)

    const tokenMetadata = {
      name: form.name,
      symbol: form.symbol,
      uri: form.uri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    }

    const treasuryFee =
      await connection.current.getMinimumBalanceForRentExemption(0)
    // Todo: metadataSize is hardcoded at this moment but should be caliculated in the future.
    // On 8.July.2022, Metadata.getMinimumBalanceForRentExemption is returning wrong price.
    // const metadataFee = await Metadata.getMinimumBalanceForRentExemption(
    //   {
    //     key: Key.MetadataV1,
    //     updateAuthority: mintAuthority,
    //     mint: form.mintAccount?.pubkey,
    //     data: tokenMetadata,
    //     primarySaleHappened: true,
    //     isMutable: true,
    //     tokenStandard: TokenStandard.Fungible,
    //     uses: null,
    //     collection: null,
    //     editionNonce: 255,
    //   },
    //   connection.current
    // )
    const metadataFee =
      await connection.current.getMinimumBalanceForRentExemption(679)
    const treasuryInfo = await connection.current.getAccountInfo(payer)
    const solTreasury = treasuryInfo?.lamports ?? 0
    const amount = treasuryFee + metadataFee - solTreasury
    if (amount > 0) {
      const preTransferIx = SystemProgram.transfer({
        fromPubkey: wallet.publicKey!,
        toPubkey: payer,
        lamports: amount,
      })
      preTransferIx.keys[0].isWritable = true
      prerequisiteInstructions.push(preTransferIx)
    }

    const transferIx = createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPDA,
        mint: form.mintAccount?.pubkey,
        mintAuthority,
        payer,
        updateAuthority: mintAuthority,
      },
      {
        createMetadataAccountArgsV3: {
          collectionDetails: null, // note: likely this field should be supported by the forms, but I don't know what it does
          data: tokenMetadata,
          isMutable: true,
        },
      },
    )
    transferIx.keys[3].isWritable = true
    serializedInstruction = serializeInstructionToBase64(transferIx)
  }
  const obj: UiInstruction = {
    serializedInstruction,
    isValid,
    governance: governedMintInfoAccount?.governance,
    prerequisiteInstructions: prerequisiteInstructions,
  }
  return obj
}

export async function getUpdateTokenMetadataInstruction({
  schema,
  form,
  programId,
  governedMintInfoAccount,
  setFormErrors,
  mintAuthority,
}: {
  schema: any
  form: any
  programId: PublicKey | undefined
  governedMintInfoAccount: AssetAccount | undefined
  setFormErrors: any
  mintAuthority: PublicKey | null | undefined
}): Promise<UiInstruction> {
  const isValid = await validateInstruction({ schema, form, setFormErrors })
  let serializedInstruction = ''
  const prerequisiteInstructions: TransactionInstruction[] = []
  if (isValid && programId && form.mintAccount?.pubkey && mintAuthority) {
    const metadataPDA = await findMetadataPda(form.mintAccount?.pubkey)

    const tokenMetadata = {
      name: form.name,
      symbol: form.symbol,
      uri: form.uri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    }

    const transferIx = createUpdateMetadataAccountV2Instruction(
      {
        metadata: metadataPDA,
        updateAuthority: mintAuthority,
      },
      {
        updateMetadataAccountArgsV2: {
          data: tokenMetadata,
          updateAuthority: mintAuthority,
          primarySaleHappened: true,
          isMutable: true,
        },
      },
    )
    serializedInstruction = serializeInstructionToBase64(transferIx)
  }

  const obj: UiInstruction = {
    serializedInstruction,
    isValid,
    governance: governedMintInfoAccount?.governance,
    prerequisiteInstructions: prerequisiteInstructions,
  }
  return obj
}

export const deduplicateObjsFilter = (value, index, self) =>
  index === self.findIndex((t) => JSON.stringify(t) === JSON.stringify(value))
