export const getSolInvestments = () => [
  {
    liquidity: 0,
    protocolSymbol: '',
    apy: '',
    protocolName: 'Marinade',
    handledMint: '',
    handledTokenSymbol: '',
    handledTokenImgSrc:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    protocolLogoSrc:
      'https://raw.githubusercontent.com/LP-Finance-Inc/token-image/main/msol.png',
    strategyName: 'Stake',
    strategyDescription: '',
    createProposalFcn: () => null,
  },
  {
    liquidity: 0,
    protocolSymbol: '',
    apy: '',
    protocolName: 'Jito',
    handledMint: '',
    handledTokenSymbol: '',
    handledTokenImgSrc:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    protocolLogoSrc:
      'https://storage.googleapis.com/token-metadata/JitoSOL-256.png',
    strategyName: 'Stake',
    strategyDescription: '',
    createProposalFcn: () => null,
  },
]

export const getTokenInvestments = (tokenImg: string) => [
  {
    liquidity: 0,
    protocolSymbol: '',
    apy: '',
    protocolName: 'Poseidon',
    handledMint: '',
    handledTokenSymbol: '',
    handledTokenImgSrc: tokenImg,
    protocolLogoSrc: '',
    strategyName: 'Trade',
    strategyDescription: '',
    createProposalFcn: () => null,
    noProtocol: true,
  },
]
