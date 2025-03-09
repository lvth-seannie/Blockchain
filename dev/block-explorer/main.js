document.getElementById('loadBlockchainBtn').addEventListener('click', toggleBlockchainContent);
document.getElementById('loadTransactionsBtn').addEventListener('click', toggleTransactionContent);
document.getElementById('transactionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const sender = document.getElementById('sender').value;
    const recipient = document.getElementById('recipient').value;
    const amount = document.getElementById('amount').value;

    const transaction = { sender, recipient, amount };

    try {
        const response = await fetch(`${nodeUrl}/transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction)
        });

        const result = await response.json();
        console.log(result);
        alert(result.note);  

        loadTransactions();
    } catch (error) {
        console.error('Error recording transaction:', error);
    }
});
document.getElementById('filterBtn').addEventListener('click', filterTransactions);

const nodeUrl = 'http://localhost:3001'; // local node URL

async function loadBlockchain() {
    try {
        const response = await fetch(`${nodeUrl}/blockchain`);
        const data = await response.json();

        const blockchainTable = document.getElementById('blockchainTable').getElementsByTagName('tbody')[0];
        blockchainTable.innerHTML = ''; // clear existing table rows

        data.chain.forEach(block => {
            const row = blockchainTable.insertRow();
            row.innerHTML = `
                <td>${block.index}</td>
                <td>${block.hash}</td>
                <td>${block.previousBlockHash}</td>
            `;
        });
    } catch (error) {
        console.error('Error loading blockchain:', error);
    }
}

async function loadTransactions() {
    try {
        const response = await fetch(`${nodeUrl}/blockchain`);
        const data = await response.json();

        const transactionTable = document.getElementById('transactionTable').getElementsByTagName('tbody')[0];
        transactionTable.innerHTML = ''; 

        data.chain.forEach(block => {
            block.transactions.forEach(transaction => {
                const row = transactionTable.insertRow();
                row.innerHTML = `
                    <td>${transaction.sender}</td>
                    <td>${transaction.recipient}</td>
                    <td>${transaction.amount}</td>
                `;
            });
        });
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}


async function filterTransactions() {
    const senderFilter = document.getElementById('filterSender').value;
    const recipientFilter = document.getElementById('filterRecipient').value;
    const amountFilter = document.getElementById('filterAmount').value;

    try {
        const response = await fetch(`${nodeUrl}/blockchain`);
        const data = await response.json();

        const filteredTransactions = [];
        data.chain.forEach(block => {
            block.transactions.forEach(transaction => {
                if (
                    (senderFilter && transaction.sender.includes(senderFilter)) ||
                    (recipientFilter && transaction.recipient.includes(recipientFilter)) ||
                    (amountFilter && transaction.amount == amountFilter)
                ) {
                    filteredTransactions.push(transaction);
                }
            });
        });

        displayFilteredTransactions(filteredTransactions);
    } catch (error) {
        console.error('Error filtering transactions:', error);
    }
}

function displayFilteredTransactions(filteredTransactions) {
    const transactionTable = document.getElementById('transactionTable').getElementsByTagName('tbody')[0];
    transactionTable.innerHTML = '';

    filteredTransactions.forEach(transaction => {
        const row = transactionTable.insertRow();
        row.innerHTML = `
            <td>${transaction.sender}</td>
            <td>${transaction.recipient}</td>
            <td>${transaction.amount}</td>
        `;
    });
}

// Toggle visibility of blockchain content
function toggleBlockchainContent() {
    const blockchainContent = document.getElementById('blockchainContent');
    blockchainContent.classList.toggle('toggle-section');
    if (!blockchainContent.classList.contains('toggle-section')) {
        loadBlockchain();
    }
}

// Toggle visibility of transaction content
function toggleTransactionContent() {
    const transactionContent = document.getElementById('transactionContent');
    transactionContent.classList.toggle('toggle-section');
    if (!transactionContent.classList.contains('toggle-section')) {
        loadTransactions();
    }
}
