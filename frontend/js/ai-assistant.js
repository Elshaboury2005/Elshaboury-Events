// Hide AI Assistant for guests or unlogged users
(function () {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const token = localStorage.getItem('token');
    if (isLoggedIn === 'guest' || (!token && isLoggedIn !== 'true')) {
        console.log('AI Assistant is disabled for guests.');
        return;
    }

    const aiStyles = `
#ai-widget {
    position: fixed;
    bottom: 30px;
    right: 30px;
    z-index: 9000;
}

#ai-toggle {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: linear-gradient(135deg, #FF6B6B, #556270);
    border: none;
    cursor: pointer;
    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    color: white;
    font-size: 24px;
    transition: transform 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

#ai-toggle:hover {
    transform: scale(1.1);
}

.ai-toggle-icon {
    width: 28px;
    height: 28px;
}

.ai-toggle-icon path {
    fill: none;
    stroke: #fff;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.ai-toggle-icon .dot {
    fill: #fff;
}

#chat-window {
    position: absolute;
    bottom: 80px;
    right: 0;
    width: 350px;
    height: 500px;
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translateY(20px);
    transition: all 0.3s ease;
}

#chat-window.open {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
}

.chat-header {
    background: linear-gradient(135deg, #FF6B6B, #556270);
    padding: 15px 20px;
    color: white;
    font-weight: 600;
    display: flex;
    justify-content: space-between;
}

.chat-messages {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    background: #f8f9fa;
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.message {
    padding: 10px 15px;
    border-radius: 12px;
    max-width: 80%;
    font-size: 0.95rem;
    line-height: 1.4;
}

.message.bot {
    background: #e9ecef;
    color: #333;
    align-self: flex-start;
    border-bottom-left-radius: 2px;
}

.message.user {
    background: #FF6B6B;
    color: white;
    align-self: flex-end;
    border-bottom-right-radius: 2px;
}

.chat-input-area {
    padding: 15px;
    border-top: 1px solid #eee;
    display: flex;
    gap: 10px;
    background: #fff;
}

#chat-input {
    flex: 1;
    border: 1px solid #ddd;
    border-radius: 20px;
    padding: 8px 15px;
    outline: none;
}

#chat-send {
    background: #556270;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 8px 15px;
    cursor: pointer;
}
`;

    document.head.insertAdjacentHTML('beforeend', `<style>${aiStyles}</style>`);

    const widgetHTML = `
<div id="ai-widget">
    <div id="chat-window">
        <div class="chat-header">
            <span>AI Event Assistant</span>
            <span id="chat-close" style="cursor:pointer">X</span>
        </div>
        <div class="chat-messages" id="chat-messages">
            <div class="message bot">
                Hi! Ask me anything about planning your event.
            </div>
        </div>
        <div class="chat-input-area">
            <input type="text" id="chat-input" placeholder="Type a message..." />
            <button id="chat-send">Send</button>
        </div>
    </div>
    <button id="ai-toggle" aria-label="Open AI Assistant">Ã°Å¸â€™Â¬</button>
</div>
`;

    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    const chatWindow = document.getElementById('chat-window');
    const chatToggle = document.getElementById('ai-toggle');
    const chatClose = document.getElementById('chat-close');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');

    chatToggle.title = 'Chat with assistant';
    chatToggle.innerHTML =
        '<svg class="ai-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M20 15a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>' +
            '<circle class="dot" cx="8" cy="10" r="1.2"></circle>' +
            '<circle class="dot" cx="12" cy="10" r="1.2"></circle>' +
            '<circle class="dot" cx="16" cy="10" r="1.2"></circle>' +
        '</svg>';

    function toggleChat() {
        chatWindow.classList.toggle('open');
    }

    function handleKey(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    }

    async function sendMessage() {
        const input = document.getElementById('chat-input');
        const msg = input.value.trim();
        if (!msg) return;

        addMessage(msg, 'user');
        input.value = '';

        try {
            const API_BASE = window.AuthConfig?.apiBaseUrl || '/api';
            const response = await fetch(`${API_BASE}/AI/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            });

            if (!response.ok) {
                throw new Error(`AI request failed with status ${response.status}`);
            }

            const data = await response.json();
            addMessage(data.reply || 'Sorry, I could not generate a reply.', 'bot');
        } catch (err) {
            addMessage("Sorry, I'm having trouble connecting to the assistant.", 'bot');
        }
    }

    function addMessage(text, sender) {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        div.textContent = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    chatToggle.addEventListener('click', toggleChat);
    chatClose.addEventListener('click', toggleChat);
    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', handleKey);
})();


