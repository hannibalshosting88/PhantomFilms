# PhanFrame

PhanFrame is a web application that allows users to watch videos together in real-time, with synchronized playback and a built-in chat system. It's perfect for virtual watch parties, remote video discussions, or just hanging out with friends online.

## Features

- **Room Management**: Create or join different rooms for separate viewing sessions.
- **Synchronized Video Playback**: Watch videos together with playback controlled by a room leader.
- **Chat System**: Communicate with others in the room via text chat.
- **Video Uploading and Selection**: Upload your own videos and choose what to watch.
- **Real-time Interactions**: See who's online and react to the video with emojis.
- **User Interface**: A responsive design that works on both desktop and mobile devices.

## Setup

To run PhanFrame locally, follow these steps:

1. Clone the repository:
   
   git clone https://github.com/yourusername/phanframe.git
   cd phanframe
   
2. Install dependencies:

   npm install
3. Start the server:

   npm start
   
Open your browser and navigate to http://localhost:3000.

Technologies Used

Front-end: HTML, CSS, JavaScript, Socket.io Client
Back-end: Node.js, Express, Socket.io Server, Multer


We're also packaged as Docker and have a pretty easy container.  

docker pull hannibalshosting88/phantomfilms -p 3000:3000

'''
version: "3.8"

services:
  my-webapp:
    image: hannibalshosting88/phantomfilms:latest
    ports:
      - "3000:3000"
    volumes:
      - app-data:/app/storage
      - configs:/app/config
    restart: unless-stopped

volumes:
  app-data:
  configs:
'''
