// 소켓 불러오기.
const socket = io();

// 클라이언트(peer) 들을 담을 객체 선언. 1:N 화상 면접 기능엔 필수.
const peers = {};

// 방 이름 변수 선언 (Video Interview Room)
const roomName = "viRoom";

// STUN 서버 설정 (서로의 클라이언트(peer)들을 식별해주는 서버)
const stunServer = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

document.addEventListener("DOMContentLoaded", () => {
    // 로컬 비디오 요소와 원격 비디오 컨테이너 요소 가져오기
    const localVideo = document.getElementById("localVideo");
    const remoteVideos = document.getElementById("remoteVideos");

    // 화상면접 초기화
    startVideoInterview();

    // 화상면접 함수
    async function startVideoInterview() {
        try {
            // 로컬 비디오와 오디오 스트림을 가져와서 localVideo에 설정
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = stream;

            // 방에 참가 요청을 보냄
            socket.emit("joinRoom", roomName);

            // 새로운 유저가 방에 들어올 때 처리
            socket.on("userConnected", userId => {
                console.log("면접자 입장 : ", userId);
                connectToNewUser(userId, stream);
            });

            // 오퍼 수신 시 처리
            socket.on("offer", async (data) => {
                console.log("오퍼 수신 : ", data);
                await handleOffer(data, stream);
            });

            // 앤서 수신 시 처리
            socket.on("answer", async (data) => {
                console.log("앤서 수신 : ", data);
                await handleAnswer(data);
            });

            // ICE 후보 수신 시 처리
            socket.on("candidate", async (data) => {
                console.log("후보 수신 : ", data);
                await handleCandidate(data);
            });

            // 유저가 방에서 나갔을 때 처리
            socket.on("userDisconnected", userId => {
                console.log("면접자 퇴장 : ", userId);
                userDisconnected(userId);
            });

        } catch (error) {
            // 화상면접 초기화 중 발생한 에러 처리
            console.error("화상면접 함수 에러 : ", error);
        }
    }

    // 새로운 유저와 연결 설정
    function connectToNewUser(userId, stream) {
        console.log("화상 면접자 연결 됨 : ", userId);

        // 새로운 피어 연결 설정
        if (!peers[userId]) {
            // peer 연결을 STUN 서버에 연결 (서로의 클라이언트(peer)들을 식별해주는 서버)
            const peerConnection = new RTCPeerConnection(stunServer);

            // peers 객체에 피어 연결 추가
            peers[userId] = peerConnection;

            // 로컬 스트림의 트랙을 피어 연결에 추가
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            // ICE 후보 이벤트 처리
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    console.log("ICE 후보 : ", event.candidate);
                    // ICE 후보 정보를 상대 피어에게 전달
                    socket.emit("candidate", {
                        target: userId,
                        candidate: event.candidate
                    });
                }
            };

            // 원격 스트림 이벤트 처리
            peerConnection.ontrack = event => {
                handleRemoteStream(event, userId);
            };

            // 오퍼 생성 및 전송
            peerConnection.createOffer().then(offer => {
                return peerConnection.setLocalDescription(offer);
            }).then(() => {
                socket.emit("offer", {
                    target: userId,
                    sdp: peerConnection.localDescription,
                    sender: socket.id
                });
            }).catch(error => {
                console.error("오퍼 생성 및 전송 실패 : ", error);
            });
        }
    }

    // 오퍼 처리 함수
    async function handleOffer(data, stream) {

        if (!peers[data.sender]) {
            // STUN 서버에 새로운 피어 연결 설정
            const peerConnection = new RTCPeerConnection(stunServer);
            
            // peers 객체에 피어 연결 추가
            peers[data.sender] = peerConnection;

            // 로컬 스트림의 트랙을 피어 연결에 추가
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            // ICE 후보 이벤트 처리
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    console.log("ICE 후보 전송 :", event.candidate);
                    // ICE 후보 정보를 상대 피어에게 전달
                    socket.emit("candidate", {
                        target: data.sender,
                        candidate: event.candidate
                    });
                }
            };

            // 원격 스트림 이벤트 처리
            peerConnection.ontrack = event => {
                handleRemoteStream(event, data.sender);
            };

            // 원격 설명 설정 및 앤서 생성 및 전송
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit("answer", {
                    target: data.sender,
                    sdp: peerConnection.localDescription
                });
            } catch (error) {
                console.error("오퍼 제어 실패 : ", error);
            }
        }
    }

    // 앤서 처리 함수
    async function handleAnswer(data) {
        // 피어 연결 가져오기
        const peerConnection = peers[data.sender];
        if (peerConnection) {
            try {
                // 원격 설명 설정
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                console.log("리모트 설정 성공");
            } catch (error) {
                console.error("리모트 설정 실패 : ", error);
            }
        } else {
            console.error(`peers 배열에서 샌더가 존재하지 않음 : ${data.sender}`);
        }
    }

    // ICE 후보 처리 함수
    async function handleCandidate(data) {
        // 피어 연결 가져오기
        const peerConnection = peers[data.sender];

        if (peerConnection) {
            try {
                // ICE 후보 추가
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log("ICE 후보 추가 완료");
            } catch (error) {
                console.error("ICE 후보 추가 에러 : ", error);
            }
        } else {
            console.error(`피어 배열에서 후보 찾기 실패 : ${data.sender}`);
        }
    }

    // 유저가 방을 나갔을 때 처리
    function userDisconnected(userId) {
        // 피어 연결 가져오기
        const peerConnection = peers[userId];
        if (peerConnection) {
            // 피어 연결 종료 및 peers 객체에서 삭제
            peerConnection.close();
            delete peers[userId];
            // 원격 비디오 요소 제거
            const remoteVideo = document.getElementById(userId);
            if (remoteVideo) {
                remoteVideos.removeChild(remoteVideo);
            }
        }
    }

    // 원격 스트림을 화면에 추가하는 함수
    function handleRemoteStream(event, userId) {
        console.log('Remote stream received:', event.streams[0]);
        // 원격 비디오 요소가 없으면 새로 추가
        if (!document.getElementById(userId)) {
            const remoteVideo = document.createElement("video");
            remoteVideo.id = userId;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.classList.add("remoteVideo");
            remoteVideo.srcObject = event.streams[0];
            remoteVideos.appendChild(remoteVideo);
        }
    }
});
