const socket = io();

// 클라이언트(peer) 들을 담을 객체 선언. 1:N 화상 면접 기능엔 필수.
const peers = {};

// 방 이름 변수 선언 (Video Interview Room)
const roomName = 'viRoom';

// STUN 서버 설정 (서로의 클라이언트(peer)들을 식별해주는 서버)
const stunServer = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

document.addEventListener("DOMContentLoaded", async () => {
    const localVideo = document.getElementById("localVideo");
    const remoteVideos = document.getElementById("remoteVideos");

    try {
        // 클라이언트의 비디오와 오디오를 가져와서 localVideo에 할당.
        const mediaInfo = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = mediaInfo;

        // 방에 참가
        socket.emit("joinRoom", roomName);

        // 유저가 방에 들어올 때 연결해주는 코드.
        socket.on("userConnected", userId => {
            console.log("유저가 방에 들어옴...", userId);
            userConnected(userId, mediaInfo);
        });

        // offer를 수신했을 때 처리
        socket.on("offer", async (data) => {
            console.log('Offer received:', data);
            if (!peers[data.sender]) {
                const peerConnection = new RTCPeerConnection(stunServer);
                peers[data.sender] = peerConnection;

                mediaInfo.getTracks().forEach(track => peerConnection.addTrack(track, mediaInfo));

                peerConnection.onicecandidate = e => {
                    if (e.candidate) {
                        socket.emit("candidate", {
                            target: data.sender,
                            candidate: e.candidate
                        });
                    }
                };

                // 방에 있을 때 들어오는 유저들의 화면을 연결해줌
                peerConnection.ontrack = e => handleRemoteStream(e, data.sender);

                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    socket.emit("answer", {
                        target: data.sender,
                        sdp: peerConnection.localDescription
                    });
                } catch (error) {
                    console.error('Error handling offer:', error);
                }
            }
        });

        // answer를 수신했을 때 처리
        socket.on("answer", (data) => {
            console.log('Answer received:', data);
            const peerConnection = peers[data.sender];
            if (peerConnection) {
                peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))
                    .then(() => {
                        console.log('Remote description set successfully');
                    })
                    .catch(error => console.error('Error setting remote description:', error));
            }
        });

        //peer들을 stun서버나, 로컬네트워크를 통해 나온 정보를 수잡하고 피어들을 교환해주는 ice프로토콜 (NAT 및 방화벽 뒤에 있는 피어간의 연결을 가능하게 해줌)
        socket.on("candidate", (data) => {
            console.log('ICE Candidate received:', data);
            const peerConnection = peers[data.sender];
            if (peerConnection) {
                peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                    .then(() => {
                        console.log('ICE candidate added successfully');
                    })
                    .catch(error => console.error('Error adding ICE candidate:', error));
            }
        });

        // 유저가 방을 나갔을 때 처리
        socket.on("userDisconnected", userId => {
            console.log('User disconnected:', userId);
            const peerConnection = peers[userId];
            if (peerConnection) {
                peerConnection.close();
                delete peers[userId];
                const remoteVideo = document.getElementById(userId);
                if (remoteVideo) {
                    remoteVideos.removeChild(remoteVideo);
                }
            }
        });

    } catch (error) {
        console.error('Error accessing media devices:', error);
    }
});

// 유저 연결 함수
function userConnected(userId, mediaInfo) {
    console.log("화상면접장에 입장하셨습니다", userId);

    if (!peers[userId]) {
        // StunServer에 peer들을 넣음.
        const peerConnection = new RTCPeerConnection(stunServer);

        // peer 배열에 키와 벨류값 선언.
        peers[userId] = peerConnection;

        // 미디어의 트랙을 가져와서 피어들의 미디어 정보를 추가
        mediaInfo.getTracks().forEach(track => peerConnection.addTrack(track, mediaInfo));

        // ICE 후보 처리
        peerConnection.onicecandidate = e => {
            if (e.candidate) {
                console.log("Candidate 발생", e.candidate);
                socket.emit("candidate", {
                    target: userId,
                    candidate: e.candidate
                });
            }
        };

        // 방에 들어올 때 다른사람들을 화면을 호출해줌.
        peerConnection.ontrack = e => handleRemoteStream(e, userId);

        // offer 생성 및 전송
        peerConnection.createOffer().then(offer => {
            // 로컬 설명 설정
            return peerConnection.setLocalDescription(offer);
        })
        .then(() => {
            // offer를 다른 peer에게 전송
            socket.emit('offer', {
                target: userId,
                sdp: peerConnection.localDescription,
                sender: socket.id
            });
        })
        .catch(error => {
            console.error('Error creating or sending offer:', error);
        });
    }
}

// 리모트 트랙을 처리하는 함수.
function handleRemoteStream(event, userId) {
    const remoteVideos = document.getElementById("remoteVideos");
    console.log('Remote stream received:', event.streams[0]);
    if (!document.getElementById(userId)) {
        const remoteVideo = document.createElement("video");
        remoteVideo.id = userId;
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.classList.add("remoteVideo");
        remoteVideo.srcObject = event.streams[0];
        remoteVideos.appendChild(remoteVideo);
        console.log('Remote video element added:', remoteVideo);
    }
}
