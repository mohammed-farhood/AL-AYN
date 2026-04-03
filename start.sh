#!/bin/bash

# Function to kill background processes on exit
cleanup() {
    echo -e "\n🛑 Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

echo "🚀 Starting Waman-Ahyaha Application..."

# 1. Start Backend in the background
echo "📦 Starting Backend Server..."
cd backend
node server.js &
BACKEND_PID=$!
cd ..

# 2. Start Frontend Server in the background
echo "🌐 Starting Frontend Server (Port 5500)..."
python3 -m http.server 5500 &
FRONTEND_PID=$!

# 3. Wait a moment for servers to wake up
sleep 2

# 4. Open the browser
echo "🖥️ Opening http://localhost:5500..."
open http://localhost:5500

echo "✅ App is running! Press Ctrl+C to stop both servers."

# Keep script alive to maintain background processes
wait
