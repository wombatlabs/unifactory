import TokenAbi from 'human-standard-token-abi'
import FactoryJson from '../contracts/build/Factory.json'
import RouterV2Json from '../contracts/build/RouterV2.json'
import Storage from '../contracts/build/Storage.json'
import { networks, wrapperCurrencies } from '../constants'
import { cache, addValue } from './cache'

const log = (message) => {
  console.group('%c Log', 'color: crimson; font-size: 14px;')
  console.log(message)
  console.groupEnd()
}

const deployContract = async (params) => {
  const { abi, byteCode, library, onDeploy, deployArguments } = params

  let contract
  let accounts

  try {
    contract = new library.eth.Contract(abi)
    accounts = await window.ethereum.request({ method: 'eth_accounts' })
  } catch (error) {
    throw new Error(error)
  }

  const transaction = contract.deploy({
    data: byteCode,
    arguments: deployArguments,
  })

  try {
    const gas = await transaction.estimateGas({ from: accounts[0] })

    if (gas) {
      return await transaction
        .send({
          from: accounts[0],
          gas,
        })
        .on('transactionHash', (hash) => log(`deployment tx hash: ${hash}`))
        .on('error', (error) => console.error(error))
        .on('receipt', (receipt) => onDeploy(receipt))
    }
  } catch (error) {
    throw new Error(error)
  }
}

export const deployFactory = async (params) => {
  const { library, onDeploy, admin } = params
  const { abi, bytecode } = FactoryJson

  return await deployContract({
    abi,
    byteCode: bytecode,
    deployArguments: [admin],
    library,
    onDeploy,
  })
}

export const deployRouter = async (params) => {
  const { library, factory, onDeploy } = params
  const { abi, bytecode } = RouterV2Json
  const chainId = await library.eth.getChainId()
  const wrapperCurrency = wrapperCurrencies[chainId]

  return await deployContract({
    abi,
    byteCode: bytecode,
    deployArguments: [factory, wrapperCurrency],
    library,
    onDeploy,
  })
}

export const deployStorage = async (params) => {
  const { library, admin, onDeploy } = params
  const { abi, bytecode } = Storage
  const chainId = await library.eth.getChainId()
  const wrapperCurrency = wrapperCurrencies[chainId]

  return await deployContract({
    abi,
    byteCode: bytecode,
    deployArguments: [admin],
    library,
    onDeploy,
  })
}

export const getContractInstance = (library, address, abi) => {
  return new library.eth.Contract(abi, address)
}

export const deploySwapContract = async (params) => {
  const { admin, feeRecipient, library, onFactoryDeploy, onRouterDeploy } =
    params

  const accounts = await window.ethereum.request({ method: 'eth_accounts' })
  const factoryInstance = await deployFactory({
    onDeploy: onFactoryDeploy,
    library,
    admin: accounts[0],
  })

  if (factoryInstance) {
    const routerInstance = await deployRouter({
      onDeploy: onRouterDeploy,
      library,
      factory: factoryInstance.options.address,
    })

    await factoryInstance.methods
      .setFeeTo(feeRecipient)
      .send({
        from: accounts[0],
      })
      .catch((error) => {
        console.error('setFeeTo: ', error)
      })

    await factoryInstance.methods
      .setFeeToSetter(admin)
      .send({
        from: accounts[0],
      })
      .catch((error) => {
        console.error('setFeeToSetter: ', error)
      })
  } else {
    throw new Error('No factory contract')
  }
}

export const isContract = async (library, address) => {
  const lowerAddress = address.toLowerCase()

  if (cache.isContract && cache.isContract[address]) {
    return cache.isContract[address]
  }

  const codeAtAddress = await library.eth.getCode(address)
  const codeIsEmpty =
    !codeAtAddress || codeAtAddress === '0x' || codeAtAddress === '0x0'

  if (!cache.isContract) cache.isContract = {}

  cache.isContract[address] = !codeIsEmpty

  return !codeIsEmpty
}

export const returnTokenInfo = async (library, address) => {
  const result = await isContract(library, address)

  if (result) {
    const contract = new library.eth.Contract(TokenAbi, address)
    const name = await contract.methods.name().call()
    const symbol = await contract.methods.symbol().call()
    const decimals = await contract.methods.decimals().call()

    return {
      name,
      symbol,
      decimals,
    }
  }

  return false
}