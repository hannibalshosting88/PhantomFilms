// Global variables
let socket;
let currentRoom = 'main';
let username;
let typingTimer;
let isTyping = false;
let selectedVideo = null;
let isFullscreenMode = false;
let isRoomLeader = false;


// DOM elements
const elements = {
    // Video player elements
    videoPlayer: document.getElementById('videoPlayer'),
    videoSource: document.getElementById('videoSource'),
    playButton: document.getElementById('playButton'),
    pauseButton: document.getElementById('pauseButton'),
    fullscreenButton: document.getElementById('fullscreenButton'),

    // Chat elements
    chatInput: document.getElementById('chatInput'),
    sendButton: document.getElementById('sendButton'),
    chatMessages: document.getElementById('chatMessages'),
    typingIndicator: document.getElementById('typingIndicator'),
    userCount: document.getElementById('userCount'),

    // Room elements
    roomNameInput: document.getElementById('roomNameInput'),
    createRoomButton: document.getElementById('createRoomButton'),
    roomList: document.getElementById('roomList'),

    // Video upload elements
    fileInput: document.getElementById('fileInput'),
    uploadButton: document.getElementById('uploadButton'),
    uploadLoader: document.getElementById('uploadLoader'),
    uploadStatus: document.getElementById('uploadStatus'),

    // Video list elements
    videoList: document.getElementById('videoList'),

    // Notification
    notification: document.getElementById('notification')
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing application');
    
    // Get username from user
    username = prompt('Enter your username:', 'User' + Math.floor(Math.random() * 1000));

    if (!username || username.trim() === '') {
        username = 'User' + Math.floor(Math.random() * 1000);
    }

    console.log('Username set to:', username);

    // Initialize Socket.io connection
    initializeSocket();

    // Set up event listeners
    setupEventListeners();

    // Load available videos
    loadVideos();

    // Load available rooms
    loadRooms();
});

// Initialize Socket.io connection
function initializeSocket() {
    console.log('Initializing socket connection');
    socket = io();

    // Handle connection
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('user-joined', username);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showNotification('Disconnected from server. Trying to reconnect...');
    });

    // Update user count
    socket.on('user-count', (data) => {
        console.log('User count update:', data);
        elements.userCount.textContent = data.room || data.total;
    });

    // Handle room joining notification
    socket.on('user-joined-notification', (username) => {
        console.log('User joined:', username);
        addSystemMessage(`${username} joined the room`);
    });

    // Handle room list update
    socket.on('room-list', (rooms) => {
        console.log('Room list update:', rooms);
        updateRoomList(rooms);
    });

    // Handle new room created
    socket.on('room-created', (room) => {
        console.log('New room created:', room);
        addRoomToList(room);
    });

    // Handle room deleted
    socket.on('room-deleted', (roomName) => {
        console.log('Room deleted:', roomName);
        const roomElement = document.querySelector(`.room-item[data-room="${roomName}"]`);
        if (roomElement) {
            roomElement.remove();
        }
    });

    // Handle room user counts update
    socket.on('room-user-counts', (rooms) => {
        console.log('Room user counts update:', rooms);
        updateRoomCounts(rooms);
    });

    // Handle video selection
    socket.on('video-selected', (videoUrl) => {
        console.log('Video selected event:', videoUrl);
        loadVideo(videoUrl);
        selectedVideo = videoUrl;
        highlightSelectedVideo(videoUrl);
    });

    // Handle video synchronization
    socket.on('sync-video', (videoState) => {
        console.log('Video sync event:', videoState);
        syncVideoState(videoState);
    });

    // Handle chat messages
    socket.on('chat-message', (data) => {
        console.log('Chat message received:', data);
        addChatMessage(data.username, data.message, false);
    });

    // Handle typing indicators
    socket.on('user-typing', (username) => {
        console.log('User typing:', username);
        elements.typingIndicator.textContent = `${username} is typing...`;
        elements.typingIndicator.style.display = 'block';
    });

    socket.on('user-stopped-typing', () => {
        console.log('User stopped typing');
        elements.typingIndicator.style.display = 'none';
    });

    // Handle new videos
    socket.on('new-video', (videoInfo) => {
        console.log('New video available:', videoInfo);
        addVideoToList(videoInfo);
        showNotification('New video uploaded: ' + videoInfo.name);
    });

    // Handle reactions
    socket.on('reaction', (data) => {
        console.log('Reaction received:', data);
        showReaction(data.reaction);
        addSystemMessage(`${data.username} reacted with ${data.reaction}`);
    });

    // Handle leader status
    socket.on('leader-status', (data) => {
        console.log('Leader status received:', data);
        isRoomLeader = data.isLeader;
        updateControlsVisibility();
    });
}

// Set up event listeners
function setupEventListeners() {
    console.log('Setting up event listeners');
    
    // Video player setup and events
    console.log('Video element:', elements.videoPlayer);
    console.log('Video dimensions:', {
        clientWidth: elements.videoPlayer.clientWidth,
        clientHeight: elements.videoPlayer.clientHeight
    });

    // Video player controls
    elements.playButton.addEventListener('click', () => {
        console.log('Play button clicked');
        if (elements.videoPlayer.paused) {
            console.log('Attempting to play video');
            elements.videoPlayer.play()
                .then(() => console.log('Video play successful'))
                .catch(err => console.error('Error playing video:', err));
        }
    });

    elements.pauseButton.addEventListener('click', () => {
        console.log('Pause button clicked');
        if (!elements.videoPlayer.paused) {
            console.log('Pausing video');
            elements.videoPlayer.pause();
        }
    });

    elements.fullscreenButton.addEventListener('click', toggleFullscreen);

    // Video player events
    elements.videoPlayer.addEventListener('play', () => {
        console.log('Video play event fired');
        if (isRoomLeader) {
            console.log('Emitting play event to server');
            socket.emit('video-event', {
                type: 'play',
                currentTime: elements.videoPlayer.currentTime
            });
        }
    });

    elements.videoPlayer.addEventListener('pause', () => {
        console.log('Video pause event fired');
        if (isRoomLeader) {
            console.log('Emitting pause event to server');
            socket.emit('video-event', {
                type: 'pause',
                currentTime: elements.videoPlayer.currentTime
            });
        }
    });

    // Add debouncing for seek events to prevent excessive updates
    let seekTimer = null;
    elements.videoPlayer.addEventListener('seeked', () => {
        console.log('Video seeked event fired');
        if (!isRoomLeader) {
            return;
        }

        // Clear previous timer
        clearTimeout(seekTimer);

        // Set a small delay before emitting the event
        seekTimer = setTimeout(() => {
            console.log('Emitting seek event to server');
            socket.emit('video-event', {
                type: 'seek',
                currentTime: elements.videoPlayer.currentTime
            });
        }, 200); // 200ms debounce
    });

    // Add video state change debugging
    elements.videoPlayer.addEventListener('loadstart', () => console.log('Video loadstart event'));
    elements.videoPlayer.addEventListener('loadedmetadata', () => console.log('Video loadedmetadata event'));
    elements.videoPlayer.addEventListener('loadeddata', () => console.log('Video loadeddata event'));
    elements.videoPlayer.addEventListener('canplay', () => console.log('Video canplay event'));
    elements.videoPlayer.addEventListener('error', (e) => {
        console.error('Video error event:', e);
        console.error('Error details:', elements.videoPlayer.error);
    });

    // Chat controls
    elements.sendButton.addEventListener('click', sendMessage);

    elements.chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }

        // Handle typing indicator
        if (!isTyping) {
            isTyping = true;
            socket.emit('user-typing');
        }

        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            isTyping = false;
            socket.emit('user-stopped-typing');
        }, 1000);
    });

    // Room controls
    elements.createRoomButton.addEventListener('click', () => {
        const roomName = elements.roomNameInput.value.trim();
        if (roomName) {
            console.log('Creating room:', roomName);
            socket.emit('create-room', roomName);
            elements.roomNameInput.value = '';
        }
    });

    // Delegated event for room items (since they are added dynamically)
    elements.roomList.addEventListener('click', (event) => {
        const roomItem = event.target.closest('.room-item');
        if (roomItem) {
            const roomName = roomItem.dataset.room;
            console.log('Room item clicked:', roomName);
            joinRoom(roomName);

            // Update active room UI
            document.querySelectorAll('.room-item').forEach(item => {
                item.classList.remove('active');
            });
            roomItem.classList.add('active');
        }
    });

    // Upload controls
    elements.uploadButton.addEventListener('click', uploadVideo);

    // Add reaction buttons
    const reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'reactions-container';

    const reactions = ['❤️', '👍', '😂', '😮', '😡'];
    reactions.forEach(reaction => {
        const button = document.createElement('button');
        button.className = 'reaction-button';
        button.textContent = reaction;
        button.addEventListener('click', () => {
            console.log('Reaction clicked:', reaction);
            socket.emit('reaction', reaction);
            showReaction(reaction);
        });
        reactionsContainer.appendChild(button);
    });

    // Add reactions container below video controls
    elements.videoPlayer.parentNode.appendChild(reactionsContainer);
}

// Client-side thumbnail generation function
function generateThumbnail(videoFile) {
    console.log('Generating thumbnail for:', videoFile.name);
    return new Promise((resolve, reject) => {
        // Create a video element
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        
        // Create object URL for the video file
        const videoURL = URL.createObjectURL(videoFile);
        video.src = videoURL;
        
        // Once video metadata is loaded
        video.onloadedmetadata = () => {
            console.log('Video metadata loaded, width:', video.videoWidth, 'height:', video.videoHeight);
            // Set video to a specific time (1 second)
            video.currentTime = 1;
            
            // When the video reaches that time
            video.onseeked = () => {
                console.log('Video seeked to timestamp for thumbnail');
                // Create a canvas element
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Draw video frame to canvas
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Convert canvas to blob (JPEG format)
                canvas.toBlob((blob) => {
                    console.log('Thumbnail generated, size:', blob.size);
                    // Clean up
                    URL.revokeObjectURL(videoURL);
                    
                    // Resolve with the blob
                    resolve(blob);
                }, 'image/jpeg', 0.7); // 0.7 quality (good balance of quality/size)
            };
            
            // Handle errors
            video.onerror = (e) => {
                console.error('Error generating thumbnail:', e);
                URL.revokeObjectURL(videoURL);
                reject(new Error('Error generating thumbnail'));
            };
            
            // Start playing to seek
            console.log('Attempting to play video to generate thumbnail');
            video.play().catch((e) => {
                console.warn('Could not play video for thumbnail generation:', e);
                // Some browsers require user interaction to play
                // In this case, we'll just try without playing
                video.currentTime = 1;
            });
        };

        // Handle metadata loading errors
        video.onerror = (e) => {
            console.error('Error loading video metadata:', e);
            URL.revokeObjectURL(videoURL);
            reject(new Error('Error loading video metadata'));
        };
    });
}

// Function to update UI based on leader status
function updateControlsVisibility() {
    console.log('Updating controls visibility. Is leader:', isRoomLeader);
    // Update button states
    elements.playButton.disabled = !isRoomLeader;
    elements.pauseButton.disabled = !isRoomLeader;

    // Update visual feedback
    if (!isRoomLeader) {
        elements.playButton.style.opacity = '0.5';
        elements.pauseButton.style.opacity = '0.5';

        // Add indicator for viewer mode
        if (!document.getElementById('viewerModeIndicator')) {
            const indicator = document.createElement('div');
            indicator.id = 'viewerModeIndicator';
            indicator.className = 'viewer-mode-indicator';
            indicator.textContent = 'Viewing Mode - Playback controlled by room leader';
            elements.videoPlayer.parentNode.appendChild(indicator);
        }
    } else {
        elements.playButton.style.opacity = '1';
        elements.pauseButton.style.opacity = '1';

        // Add leader badge
        if (!document.getElementById('leaderBadge')) {
            const badge = document.createElement('div');
            badge.id = 'leaderBadge';
            badge.className = 'leader-badge';
            badge.textContent = 'Room Leader';
            elements.videoPlayer.parentNode.appendChild(badge);
        }

        // Remove viewer indicator if it exists
        const indicator = document.getElementById('viewerModeIndicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

// Load available videos from server
function loadVideos() {
    console.log('Loading available videos');
    fetch('/api/videos')
        .then(response => response.json())
        .then(videos => {
            console.log('Videos loaded:', videos);
            elements.videoList.innerHTML = '';
            videos.forEach(video => {
                addVideoToList(video);
            });
        })
        .catch(error => {
            console.error('Error loading videos:', error);
            showNotification('Failed to load videos');
        });
}

// Add video to video list
function addVideoToList(video) {
    console.log('Adding video to list:', video);
    const videoItem = document.createElement('div');
    videoItem.className = 'video-item';
    videoItem.dataset.video = video.url;

    // Thumbnail container
    const thumbnail = document.createElement('div');
    thumbnail.className = 'video-thumbnail';

    if (video.thumbnail) {
        const img = document.createElement('img');
        img.src = video.thumbnail;
        img.alt = video.name;
        thumbnail.appendChild(img);
    } else {
        // Placeholder if no thumbnail
        thumbnail.innerHTML = '<i class="fas fa-film placeholder"></i>';
    }

    // Video name
    const videoName = document.createElement('div');
    videoName.className = 'video-name';
    videoName.textContent = video.name;

    // Play icon
    const playIcon = document.createElement('div');
    playIcon.className = 'play-icon';
    playIcon.innerHTML = '<i class="fas fa-play"></i>';

    // Add elements to video item
    videoItem.appendChild(thumbnail);
    videoItem.appendChild(videoName);
    videoItem.appendChild(playIcon);

    // Add click event
    videoItem.addEventListener('click', () => {
        console.log('Video item clicked:', video.url);
        socket.emit('select-video', video.url);
        selectedVideo = video.url;
        highlightSelectedVideo(video.url);
    });

    elements.videoList.appendChild(videoItem);
}

// Highlight selected video
function highlightSelectedVideo(videoUrl) {
    console.log('Highlighting selected video:', videoUrl);
    document.querySelectorAll('.video-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.video === videoUrl) {
            item.classList.add('active');
        }
    });
}

// Load video in player
function loadVideo(videoUrl) {
    console.log('Loading video:', videoUrl);
    
    if (!videoUrl) {
        console.warn('Empty video URL provided');
        return;
    }
    
    elements.videoSource.src = videoUrl;
    elements.videoPlayer.load();

    // Add error handling
    const errorHandler = (e) => {
        console.error('Error loading video:', videoUrl);
        console.error('Error details:', elements.videoPlayer.error);
        showNotification('Error loading video. The file may be corrupted or unavailable.');
        elements.videoPlayer.removeEventListener('error', errorHandler);
    };

    elements.videoPlayer.addEventListener('error', errorHandler);

    // Add a success handler
    elements.videoPlayer.addEventListener('loadeddata', () => {
        console.log('Video loaded successfully:', videoUrl);
        console.log('Video duration:', elements.videoPlayer.duration);
        elements.videoPlayer.removeEventListener('error', errorHandler);
    }, { once: true });
}

// Synchronize video state with server
function syncVideoState(videoState) {
    console.log('Syncing video state:', videoState);
    
    if (videoState.currentVideo && videoState.currentVideo !== elements.videoSource.src) {
        console.log('Loading new video from sync:', videoState.currentVideo);
        loadVideo(videoState.currentVideo);
        selectedVideo = videoState.currentVideo;
        highlightSelectedVideo(videoState.currentVideo);
    }

    // Match the video time if it's already loaded
    if (elements.videoPlayer.readyState >= 2) {
        const timeDiff = Math.abs(elements.videoPlayer.currentTime - videoState.currentTime);
        if (timeDiff > 1) {
            console.log(`Adjusting time from ${elements.videoPlayer.currentTime} to ${videoState.currentTime}`);
            elements.videoPlayer.currentTime = videoState.currentTime;
        }

        // Match the play/pause state
        if (videoState.playing && elements.videoPlayer.paused) {
            console.log('Playing video from sync event');
            elements.videoPlayer.play().catch(e => console.error('Error playing video from sync:', e));
        } else if (!videoState.playing && !elements.videoPlayer.paused) {
            console.log('Pausing video from sync event');
            elements.videoPlayer.pause();
        }
    } else {
        // If video is not loaded yet, wait for it to be ready
        console.log('Video not ready yet, setting up event handler');
        const canPlayHandler = () => {
            console.log('Video now ready, applying sync state');
            elements.videoPlayer.currentTime = videoState.currentTime;
            
            if (videoState.playing) {
                console.log('Playing video after loading');
                elements.videoPlayer.play().catch(e => console.error('Error playing video after loading:', e));
            }
            
            elements.videoPlayer.removeEventListener('canplay', canPlayHandler);
        };
        
        elements.videoPlayer.addEventListener('canplay', canPlayHandler);
    }
}

// Send chat message
function sendMessage() {
    const message = elements.chatInput.value.trim();
    if (message) {
        console.log('Sending chat message:', message);
        socket.emit('chat-message', {
            username: username,
            message: message
        });

        // Add message to chat
        addChatMessage(username, message, true);

        // Clear input
        elements.chatInput.value = '';

        // Reset typing status
        isTyping = false;
        socket.emit('user-stopped-typing');
    }
}

// Add chat message to display
function addChatMessage(username, message, isUser) {
    console.log('Adding chat message from', username, isUser ? '(self)' : '');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isUser ? 'user-message' : 'other-message'}`;

    if (!isUser) {
        const strong = document.createElement('strong');
        strong.textContent = username + ': ';
        messageElement.appendChild(strong);
    }

    const textNode = document.createTextNode(message);
    messageElement.appendChild(textNode);

    elements.chatMessages.appendChild(messageElement);

    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Add system message
function addSystemMessage(message) {
    console.log('System message:', message);
    const messageElement = document.createElement('div');
    messageElement.className = 'message system-message';
    messageElement.textContent = message;

    elements.chatMessages.appendChild(messageElement);

    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Upload video
function uploadVideo() {
    const file = elements.fileInput.files[0];
    if (!file) {
        showNotification('Please select a video file');
        return;
    }

    // Check if file is a video
    if (!file.type.startsWith('video/')) {
        showNotification('Only video files are allowed');
        return;
    }

    console.log('Starting video upload process for:', file.name);

    // Show loader
    elements.uploadLoader.style.display = 'block';
    elements.uploadStatus.textContent = 'Generating thumbnail...';

    // Generate thumbnail client-side first
    generateThumbnail(file)
        .then(thumbnailBlob => {
            console.log('Thumbnail generated, preparing upload');
            // Create form data with both video and thumbnail
            const formData = new FormData();
            formData.append('video', file);
            
            // Add thumbnail with a filename based on the video
            const thumbnailFilename = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            formData.append('thumbnail', thumbnailBlob, thumbnailFilename);
            
            elements.uploadStatus.textContent = 'Uploading...';
            
            console.log('Starting upload to server');
            // Upload files
            return fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Upload failed: ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('Upload successful:', data);
            elements.uploadStatus.textContent = 'Upload successful!';
            elements.fileInput.value = '';
            showNotification('Video uploaded successfully');
        })
        .catch(error => {
            console.error('Error uploading video:', error);
            elements.uploadStatus.textContent = 'Upload failed: ' + error.message;
            showNotification('Upload failed');
        })
        .finally(() => {
            elements.uploadLoader.style.display = 'none';
        });
}

// Load available rooms
function loadRooms() {
    console.log('Loading available rooms');
    fetch('/api/rooms')
        .then(response => response.json())
        .then(rooms => {
            console.log('Rooms loaded:', rooms);
            updateRoomList(rooms);
        })
        .catch(error => {
            console.error('Error loading rooms:', error);
        });
}

// Update room list
function updateRoomList(rooms) {
    console.log('Updating room list:', rooms);
    elements.roomList.innerHTML = '';
    rooms.forEach(room => {
        addRoomToList(room);
    });

    // Mark current room as active
    const currentRoomElement = document.querySelector(`.room-item[data-room="${currentRoom}"]`);
    if (currentRoomElement) {
        currentRoomElement.classList.add('active');
    }
}

// Add room to list
function addRoomToList(room) {
    console.log('Adding room to list:', room);
    const roomItem = document.createElement('div');
    roomItem.className = 'room-item';
    if (room.name === currentRoom) {
        roomItem.classList.add('active');
    }
    roomItem.dataset.room = room.name;
    roomItem.textContent = `${room.name} (${room.userCount})`;

    elements.roomList.appendChild(roomItem);
}

// Update room counts
function updateRoomCounts(rooms) {
    console.log('Updating room counts:', rooms);
    rooms.forEach(room => {
        const roomElement = document.querySelector(`.room-item[data-room="${room.name}"]`);
        if (roomElement) {
            roomElement.textContent = `${room.name} (${room.userCount})`;
        }
    });
}

// Join room
function joinRoom(roomName) {
    if (roomName !== currentRoom) {
        console.log('Joining room:', roomName);
        socket.emit('join-room', roomName);
        currentRoom = roomName;
        addSystemMessage(`You joined room: ${roomName}`);
    }
}

// Toggle fullscreen
function toggleFullscreen() {
    console.log('Toggling fullscreen mode');
    if (!document.fullscreenElement) {
        // Enter fullscreen
        if (elements.videoPlayer.requestFullscreen) {
            elements.videoPlayer.requestFullscreen();
        } else if (elements.videoPlayer.webkitRequestFullscreen) {
            elements.videoPlayer.webkitRequestFullscreen();
        } else if (elements.videoPlayer.msRequestFullscreen) {
            elements.videoPlayer.msRequestFullscreen();
        }

        isFullscreenMode = true;
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }

        isFullscreenMode = false;
    }
}

// Show notification
function showNotification(message) {
    console.log('Showing notification:', message);
    elements.notification.textContent = message;
    elements.notification.style.display = 'block';

    // Hide after 3 seconds
    setTimeout(() => {
        elements.notification.style.display = 'none';
    }, 3000);
}

// Show reaction animation
function showReaction(emoji) {
    console.log('Showing reaction:', emoji);
    const reaction = document.createElement('div');
    reaction.className = 'reaction';
    reaction.textContent = emoji;

    // Random position over the video
    const videoRect = elements.videoPlayer.getBoundingClientRect();
    const x = videoRect.left + Math.random() * videoRect.width;
    const y = videoRect.top + videoRect.height * 0.7; // Appear in lower part of video

    reaction.style.left = x + 'px';
    reaction.style.top = y + 'px';

    document.body.appendChild(reaction);

    // Remove after animation completes
    setTimeout(() => {
        document.body.removeChild(reaction);
    }, 2000);
}