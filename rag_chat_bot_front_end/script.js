// Configuration
const API_BASE_URL = 'http://localhost:8000';
let documentsUploaded = false;

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearChat');
const loadingOverlay = document.getElementById('loadingOverlay');
const inputStatus = document.getElementById('inputStatus');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    updateMessageTimes();
});

// Markdown Parser Function
function parseMarkdown(text) {
    // Escape HTML first
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Headers (# ## ###)
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold (**text** or __text__)
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic (*text* or _text_)
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Code blocks (```code```)
    text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code (`code`)
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Links [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // Unordered lists (- item or * item)
    text = text.replace(/^\s*[\-\*]\s+(.+)$/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Ordered lists (1. item)
    text = text.replace(/^\s*\d+\.\s+(.+)$/gim, '<li>$1</li>');
    
    // Line breaks (double newline = paragraph, single newline = br)
    text = text.replace(/\n\n/g, '</p><p>');
    text = text.replace(/\n/g, '<br>');
    
    // Wrap in paragraph if not already wrapped
    if (!text.startsWith('<')) {
        text = '<p>' + text + '</p>';
    }
    
    // Clean up empty paragraphs
    text = text.replace(/<p><\/p>/g, '');
    
    return text;
}

// Event Listeners
function initializeEventListeners() {
    // File upload events
    const uploadBtn = document.getElementById('uploadBtn');
    uploadArea.addEventListener('click', (e) => {
        // Only trigger if clicking the upload area itself, not the button
        if (e.target === uploadArea || uploadArea.contains(e.target) && e.target !== uploadBtn) {
            fileInput.click();
        }
    });
    uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        fileInput.click();
    });
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // Chat events
    chatInput.addEventListener('keypress', handleKeyPress);
    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', clearChat);

    // Auto-resize chat input
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });
}

// File Upload Handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

function handleFiles(files) {
    const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
        showUploadStatus('Please select PDF files only.', 'error');
        return;
    }

    if (pdfFiles.length > 5) {
        showUploadStatus('Maximum 5 files allowed at once.', 'error');
        return;
    }

    uploadFiles(pdfFiles);
}

async function uploadFiles(files) {
    showLoading(true);
    showUploadStatus('Uploading and processing files...', 'loading');

    try {
        const uploadPromises = files.map(file => uploadSingleFile(file));
        const results = await Promise.all(uploadPromises);
        
        const successCount = results.filter(result => result.success).length;
        const totalCount = results.length;

        if (successCount === totalCount) {
            showUploadStatus(`Successfully uploaded and processed ${successCount} file(s)!`, 'success');
            enableChat();
        } else {
            showUploadStatus(`Uploaded ${successCount}/${totalCount} files. Some files failed to process.`, 'error');
            if (successCount > 0) enableChat();
        }
    } catch (error) {
        console.error('Upload error:', error);
        showUploadStatus('Upload failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function uploadSingleFile(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}/uploadfile/`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Upload response:', data);
        return { success: true, data };
    } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        return { success: false, error: error.message };
    }
}

function showUploadStatus(message, type) {
    uploadStatus.textContent = message;
    uploadStatus.className = `upload-status ${type}`;
}

function enableChat() {
    documentsUploaded = true;
    chatInput.disabled = false;
    sendBtn.disabled = false;
    inputStatus.textContent = 'Ready to chat! Ask questions about your uploaded documents.';
    chatInput.placeholder = 'Type your question here...';
    chatInput.focus();
}

// Chat Handlers
function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || !documentsUploaded) return;

    // Add user message to chat
    addMessage(message, 'user');
    chatInput.value = '';

    // Show typing indicator
    const typingIndicator = showTypingIndicator();

    try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: message })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Remove typing indicator
        typingIndicator.remove();
        
        // Add bot response - extract only the result from the response
        const botResponse = data.response?.result || 'Sorry, I could not process your request.';
        addMessage(botResponse, 'bot');

    } catch (error) {
        console.error('Chat error:', error);
        typingIndicator.remove();
        addMessage('Sorry, there was an error processing your request. Please try again.', 'bot');
    }
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';

    const content = document.createElement('div');
    content.className = 'message-content';
    
    const messageText = document.createElement('div');
    
    // Render markdown for bot messages, plain text for user messages
    if (sender === 'bot') {
        messageText.innerHTML = parseMarkdown(text);
    } else {
        messageText.textContent = text;
    }
    
    const timestamp = document.createElement('span');
    timestamp.className = 'message-time';
    timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    content.appendChild(messageText);
    content.appendChild(timestamp);
    
    if (sender === 'user') {
        messageDiv.appendChild(content);
        messageDiv.appendChild(avatar);
    } else {
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
    }

    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message';
    typingDiv.id = 'typing-indicator';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<i class="fas fa-robot"></i>';

    const content = document.createElement('div');
    content.className = 'typing-indicator';
    content.innerHTML = `
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;

    typingDiv.appendChild(avatar);
    typingDiv.appendChild(content);
    chatMessages.appendChild(typingDiv);
    scrollToBottom();

    return typingDiv;
}

function clearChat() {
    // Keep only the initial bot message
    const messages = chatMessages.querySelectorAll('.message');
    for (let i = 1; i < messages.length; i++) {
        messages[i].remove();
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

function updateMessageTimes() {
    const timeElements = document.querySelectorAll('.message-time');
    timeElements.forEach(element => {
        if (!element.textContent) {
            element.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    });
}

// Error handling for network issues
window.addEventListener('online', function() {
    if (documentsUploaded) {
        inputStatus.textContent = 'Connection restored. Ready to chat!';
        inputStatus.style.color = '#28a745';
    }
});

window.addEventListener('offline', function() {
    inputStatus.textContent = 'Connection lost. Please check your internet connection.';
    inputStatus.style.color = '#dc3545';
});

// Auto-reconnect functionality
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

async function checkBackendConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/docs`, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function attemptReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        inputStatus.textContent = 'Backend server is not available. Please start the server.';
        inputStatus.style.color = '#dc3545';
        return;
    }

    const isConnected = await checkBackendConnection();
    if (isConnected) {
        inputStatus.textContent = documentsUploaded ? 'Ready to chat!' : 'Upload documents to start chatting';
        inputStatus.style.color = '#666';
        reconnectAttempts = 0;
    } else {
        reconnectAttempts++;
        setTimeout(attemptReconnect, 5000); // Retry after 5 seconds
    }
}

// Check connection on page load
setTimeout(attemptReconnect, 2000);
