const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { spawn } = require('child_process');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Create necessary directories
const mediaDir = path.join(__dirname, 'public', 'media');
const thumbnailDir = path.join(__dirname, 'public', 'thumbnails');

if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

if (!fs.existsSync(thumbnailDir)) {
  fs.mkdirSync(thumbnailDir, { recursive: true });
}

const { spawnSync } = require('child_process');

// Add this near the start of server.js to check if FFmpeg is installed
function checkFFmpeg() {
  try {
    const result = spawnSync('ffmpeg', ['-version']);
    if (result.error) {
      console.warn('FFmpeg not found. Thumbnail generation will be disabled.');
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Error checking for FFmpeg:', error.message);
    return false;
  }
}

const ffmpegAvailable = checkFFmpeg();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/media')
  },
  filename: function (req, file, cb) {
    // Use original filename but ensure it's safe
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9-_.]/g, '_');
    cb(null, safeFilename)
  }
});

// File filter for videos
const fileFilter = (req, file, cb) => {
  // Accept only video files
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept video files and jpeg images (for thumbnails)
    if (file.mimetype.startsWith('video/') || file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Only video files and thumbnails are allowed!'), false);
    }
  },
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Modify your upload route to handle both files
app.post('/api/upload', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  if (!req.files || !req.files.video) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  try {
    const videoFile = req.files.video[0];
    let thumbnailUrl = null;

    // Check if client provided a thumbnail
    if (req.files.thumbnail && req.files.thumbnail[0]) {
      const thumbnailFile = req.files.thumbnail[0];
      // Move thumbnail to the thumbnail directory
      const thumbnailName = path.basename(videoFile.filename, path.extname(videoFile.filename)) + '.jpg';
      const thumbnailPath = path.join(thumbnailDir, thumbnailName);
      
      // Use fs.rename to move the file
      await fs.promises.rename(thumbnailFile.path, thumbnailPath);
      thumbnailUrl = '/thumbnails/' + thumbnailName;
    } else {
      // No thumbnail provided, try to generate one with FFmpeg if available
      // This is your existing code as a fallback
      const thumbnailName = path.basename(videoFile.filename, path.extname(videoFile.filename)) + '.jpg';
      thumbnailUrl = await generateThumbnail(videoFile.path, thumbnailName);
    }

    const videoInfo = {
      name: videoFile.filename,
      url: `/media/${videoFile.filename}`,
      thumbnail: thumbnailUrl
    };

    // Notify all clients about the new video
    io.emit('new-video', videoInfo);

    res.json(videoInfo);
  } catch (error) {
    console.error('Error during upload process:', error);
    res.status(500).json({ error: 'Failed to process video upload' });
  }
});

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Room management
const rooms = {
  'main': {
    users: {},
    leader: null, // Track who controls the video
    videoState: {
      playing: false,
      currentTime: 0,
      lastUpdate: Date.now(),
      currentVideo: ''
    }
  }
};


// User tracking
let users = {};
let userCount = 0;

// Generate thumbnail for uploaded videos
function generateThumbnail(videoPath, outputFilename) {
  return new Promise((resolve, reject) => {
    if (!ffmpegAvailable) {
      console.log('FFmpeg not available, skipping thumbnail generation');
      resolve(null);
      return;
    }
    
    const thumbnailPath = path.join(thumbnailDir, outputFilename);
    // Use ffmpeg to extract a frame at 1 second
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-ss', '00:00:01',
      '-frames:v', '1',
      '-q:v', '2',
      thumbnailPath
    ]);
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve('/thumbnails/' + outputFilename);
      } else {
        // If ffmpeg fails, we'll still resolve but with null
        resolve(null);
      }
    });
    
    ffmpeg.on('error', (err) => {
      console.error('Error generating thumbnail:', err);
      resolve(null);
    });
  });
}

// Update video time when playing
setInterval(() => {
  for (const roomName in rooms) {
    const room = rooms[roomName];
    if (room.videoState.playing) {
      const now = Date.now();
      const elapsed = (now - room.videoState.lastUpdate) / 1000;
      room.videoState.currentTime += elapsed;
      room.videoState.lastUpdate = now;
    }
  }
}, 1000);

// Get list of available videos
app.get('/api/videos', (req, res) => {
  fs.readdir(mediaDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to retrieve videos' });
    }
    
    // Filter only video files
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.mkv'];
    const videoPromises = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return videoExtensions.includes(ext);
      })
      .map(async (file) => {
        // Check if thumbnail exists
        const thumbnailName = path.basename(file, path.extname(file)) + '.jpg';
        const thumbnailPath = path.join(thumbnailDir, thumbnailName);
        const hasThumbnail = fs.existsSync(thumbnailPath);
        
        return {
          name: file,
          url: `/media/${file}`,
          thumbnail: hasThumbnail ? `/thumbnails/${thumbnailName}` : null
        };
      });
    
    Promise.all(videoPromises)
      .then(videos => res.json(videos))
      .catch(error => {
        console.error('Error processing videos:', error);
        res.status(500).json({ error: 'Failed to process videos' });
      });
  });
});

// Get list of rooms
app.get('/api/rooms', (req, res) => {
  const roomList = Object.keys(rooms).map(roomName => ({
    name: roomName,
    userCount: Object.keys(rooms[roomName].users).length
  }));
  
  res.json(roomList);
});

// Handle video file uploads
app.post('/api/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }
  
  try {
    // Generate thumbnail
    const thumbnailName = path.basename(req.file.filename, path.extname(req.file.filename)) + '.jpg';
    const thumbnailUrl = await generateThumbnail(req.file.path, thumbnailName);
    
    const videoInfo = {
      name: req.file.filename,
      url: `/media/${req.file.filename}`,
      thumbnail: thumbnailUrl
    };
    
    // Notify all clients about the new video
    io.emit('new-video', videoInfo);
    
    res.json(videoInfo);
  } catch (error) {
    console.error('Error during upload process:', error);
    res.status(500).json({ error: 'Failed to process video upload' });
  }
});

io.on('connection', (socket) => {
  let currentRoom = 'main';
  
  // Send current room list to new connection
  socket.emit('room-list', Object.keys(rooms).map(roomName => ({
    name: roomName,
    userCount: Object.keys(rooms[roomName].users).length
  })));
  
  // Join the main room by default
  socket.join('main');
  socket.emit('sync-video', rooms['main'].videoState);
  
  socket.on('user-joined', (username) => {
    users[socket.id] = username;
    userCount++;
    
    // Add user to main room by default
    rooms['main'].users[socket.id] = username;
    
    // If no leader is assigned for the room, make this user the leader
    if (!rooms['main'].leader) {
      rooms['main'].leader = socket.id;
    }
    
    // Let the user know if they are the leader
    socket.emit('leader-status', {
      isLeader: rooms['main'].leader === socket.id
    });
    
    // Notify all clients about updated user count
    io.emit('user-count', {
      total: userCount,
      room: Object.keys(rooms[currentRoom].users).length
    });
    
    // Notify room members about new user
    io.to(currentRoom).emit('user-joined-notification', username);
    
    console.log(`${username} joined room "${currentRoom}". Total users: ${userCount}`);
  });
  
  // Handle room creation
  socket.on('create-room', (roomName) => {
    if (!rooms[roomName]) {
      rooms[roomName] = {
        users: {},
        videoState: {
          playing: false,
          currentTime: 0,
          lastUpdate: Date.now(),
          currentVideo: ''
        }
      };
      
      // Notify all clients about the new room
      io.emit('room-created', {
        name: roomName,
        userCount: 0
      });
      
      console.log(`Room "${roomName}" created`);
    }
  });
  
  // Handle room joining
  socket.on('join-room', (roomName) => {
    // Check if room exists, if not create it
    if (!rooms[roomName]) {
      rooms[roomName] = {
        users: {},
        leader: null,
        videoState: {
          playing: false,
          currentTime: 0,
          lastUpdate: Date.now(),
          currentVideo: ''
        }
      };
    }
    
    // Leave current room
    socket.leave(currentRoom);
    
    // If this user was the leader of the current room, assign a new leader
    if (rooms[currentRoom].leader === socket.id) {
      const remainingUsers = Object.keys(rooms[currentRoom].users).filter(id => id !== socket.id);
      if (remainingUsers.length > 0) {
        // Assign first remaining user as leader
        rooms[currentRoom].leader = remainingUsers[0];
        // Notify new leader
        io.to(remainingUsers[0]).emit('leader-status', { isLeader: true });
      } else {
        rooms[currentRoom].leader = null;
      }
    }
    
    delete rooms[currentRoom].users[socket.id];
    
    // Join new room
    currentRoom = roomName;
    socket.join(currentRoom);
    rooms[currentRoom].users[socket.id] = users[socket.id];
    
    // If no leader in the new room, make this user the leader
    if (!rooms[currentRoom].leader) {
      rooms[currentRoom].leader = socket.id;
    }
    
    // Let the user know if they are the leader
    socket.emit('leader-status', {
      isLeader: rooms[currentRoom].leader === socket.id
    });
    
    // Send room's current video state
    socket.emit('sync-video', rooms[currentRoom].videoState);
    
    // Notify room members about new user
    io.to(currentRoom).emit('user-joined-notification', users[socket.id]);
    
    // Update room user counts
    io.emit('room-user-counts', Object.keys(rooms).map(room => ({
      name: room,
      userCount: Object.keys(rooms[room].users).length
    })));
    
    console.log(`${users[socket.id]} joined room "${currentRoom}"`);
  });
  
  
  // Handle video selection
  socket.on('select-video', (videoUrl) => {
    rooms[currentRoom].videoState.currentVideo = videoUrl;
    rooms[currentRoom].videoState.currentTime = 0;
    rooms[currentRoom].videoState.playing = false;
    
    // Broadcast video selection to room members
    io.to(currentRoom).emit('video-selected', videoUrl);
    io.to(currentRoom).emit('sync-video', rooms[currentRoom].videoState);
    
    console.log(`Video selected in room "${currentRoom}": ${videoUrl}`);
  });
  
  // Handle video events (play, pause, seek)
  socket.on('video-event', (data) => {
    if (data.type === 'play') {
      rooms[currentRoom].videoState.playing = true;
      rooms[currentRoom].videoState.currentTime = data.currentTime;
      rooms[currentRoom].videoState.lastUpdate = Date.now();
    } else if (data.type === 'pause') {
      rooms[currentRoom].videoState.playing = false;
      rooms[currentRoom].videoState.currentTime = data.currentTime;
    } else if (data.type === 'seek') {
      rooms[currentRoom].videoState.currentTime = data.currentTime;
      rooms[currentRoom].videoState.lastUpdate = Date.now();
    }
    
    // Broadcast updated state to all room members except sender
    socket.to(currentRoom).emit('sync-video', rooms[currentRoom].videoState);
  });
  
  // Handle chat messages
  socket.on('chat-message', (data) => {
    // Broadcast message to all room members except sender
    socket.to(currentRoom).emit('chat-message', data);
  });
  
  // Handle typing indicators
  socket.on('user-typing', () => {
    socket.to(currentRoom).emit('user-typing', users[socket.id]);
  });
  
  socket.on('user-stopped-typing', () => {
    socket.to(currentRoom).emit('user-stopped-typing', users[socket.id]);
  });
  
  // Handle reactions
  socket.on('reaction', (reaction) => {
    socket.to(currentRoom).emit('reaction', {
      reaction: reaction,
      username: users[socket.id]
    });
  });
  
  // Handle disconnections
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      // Check if user was a room leader
      if (rooms[currentRoom] && rooms[currentRoom].leader === socket.id) {
        // Find a new leader
        const remainingUsers = Object.keys(rooms[currentRoom].users).filter(id => id !== socket.id);
        if (remainingUsers.length > 0) {
          // Assign first remaining user as leader
          rooms[currentRoom].leader = remainingUsers[0];
          // Notify new leader
          io.to(remainingUsers[0]).emit('leader-status', { isLeader: true });
        } else {
          rooms[currentRoom].leader = null;
        }
      }
      
      // Remove user from their current room
      if (rooms[currentRoom]) {
        delete rooms[currentRoom].users[socket.id];
        
        // Clean up empty rooms (except main)
        if (currentRoom !== 'main' && Object.keys(rooms[currentRoom].users).length === 0) {
          delete rooms[currentRoom];
          io.emit('room-deleted', currentRoom);
        }
      }
      
      userCount--;
      delete users[socket.id];
      
      // Update room user counts
      io.emit('room-user-counts', Object.keys(rooms).map(room => ({
        name: room,
        userCount: Object.keys(rooms[room].users).length
      })));
      
      io.emit('user-count', {
        total: userCount
      });
    }
  });
  
  
// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

});
});
