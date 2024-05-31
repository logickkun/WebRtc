const express = require("express");
const https = require("https");
const fs = require('fs');
const app = express();
const socketIo = require("socket.io");

const PORT = 3000;
const HOST = "192.168.35.224";

app.use(express.static('public'));

const server = https.createServer({
  key: fs.readFileSync('D:/programing/WebRtc/server.key'),
  cert: fs.readFileSync('D:/programing/WebRtc/server.cert')
}, app);

const io = socketIo(server);

io.on("connection", (socket) => {
    socket.on('joinRoom', (roomId) => {
        console.log(`${socket.id} 님이 입장하셨습니다.`);
        socket.join(roomId);
        socket.broadcast.to(roomId).emit("userConnected", socket.id);
    });

    socket.on("disconnect", () => {
        console.log(`${socket.id} 님이 나가셨습니다.`);
        socket.broadcast.emit("userDisconnected", socket.id);
    });

    socket.on("offer", (data) => {
        console.log("오퍼 수신됨 : ", data);
        socket.to(data.target).emit("offer", { 
            sdp: data.sdp, 
            sender: socket.id 
        });
    });

    socket.on("answer", (data) => {
        console.log("앤서 수신 됨 : ", data);
        socket.to(data.target).emit("answer", { 
            sdp: data.sdp, 
            sender: socket.id 
        });
    });

    socket.on("candidate", (data) => {
        console.log("후보 수신 됨 : ", data);
        socket.to(data.target).emit("candidate", { 
            candidate: data.candidate, 
            sender: socket.id 
        });
    });
});

server.listen(PORT, HOST, () => {
  console.log(`서버 실행 중... https://${HOST}:${PORT}`);
});
