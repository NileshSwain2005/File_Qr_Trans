/* =========================================================
   YUKTI QRSTREAM
   Frontend Optical File Transfer
========================================================= */

"use strict";


/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIG = {

    // Keep this relatively small for camera reliability.
    CHUNK_SIZE: 850,

    // QR frame interval.
    FRAME_INTERVAL: 250,

    // Maximum time before a duplicate frame is accepted again.
    DUPLICATE_TIMEOUT: 1000,

};


/* =========================================================
   APPLICATION STATE
========================================================= */

const state = {

    mode: "send",

    file: null,

    fileData: null,

    chunks: [],

    fileHash: null,

    sessionId: null,

    currentFrame: 0,

    sending: false,

    paused: false,

    timer: null,

    cameraStream: null,

    scanning: false,

    receiverSession: null,

    receiverMeta: null,

    receiverPackets: new Map(),

    lastPacket: null,

    lastPacketTime: 0,

};


/* =========================================================
   DOM
========================================================= */

const $ = (id) =>
    document.getElementById(id);


/* =========================================================
   ELEMENTS
========================================================= */

const sendModeButton =
    $("sendModeButton");

const receiveModeButton =
    $("receiveModeButton");

const sendPanel =
    $("sendPanel");

const receivePanel =
    $("receivePanel");

const fileInput =
    $("fileInput");

const chooseFileButton =
    $("chooseFileButton");

const dropZone =
    $("dropZone");

const senderFileCard =
    $("senderFileCard");

const senderConfig =
    $("senderConfig");

const startSendButton =
    $("startSendButton");

const senderStream =
    $("senderStream");

const senderFileName =
    $("senderFileName");

const senderFileSize =
    $("senderFileSize");

const senderFileType =
    $("senderFileType");

const fileTypeIcon =
    $("fileTypeIcon");

const removeFileButton =
    $("removeFileButton");

const qrContainer =
    $("qrContainer");

const currentFrame =
    $("currentFrame");

const senderProgress =
    $("senderProgress");

const senderProgressText =
    $("senderProgressText");

const pauseSendButton =
    $("pauseSendButton");

const stopSendButton =
    $("stopSendButton");

const cameraVideo =
    $("cameraVideo");

const cameraCanvas =
    $("cameraCanvas");

const startCameraButton =
    $("startCameraButton");

const cameraMessage =
    $("cameraMessage");

const receiveStatus =
    $("receiveStatus");

const receiverFileName =
    $("receiverFileName");

const receiverFrameText =
    $("receiverFrameText");

const receiverProgress =
    $("receiverProgress");

const receiverBytes =
    $("receiverBytes");

const missingFrames =
    $("missingFrames");

const receiverState =
    $("receiverState");

const completionBox =
    $("completionBox");

const completionText =
    $("completionText");

const downloadButton =
    $("downloadButton");

const newReceiveButton =
    $("newReceiveButton");

const statusDot =
    $("statusDot");

const statusText =
    $("statusText");


/* =========================================================
   GENERAL HELPERS
========================================================= */

function humanSize(bytes) {

    if (bytes < 1024)
        return `${bytes} B`;

    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(2)} KB`;

    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}


function generateSessionId() {

    const random =
        crypto.getRandomValues(
            new Uint32Array(3)
        );

    return Array
        .from(random)
        .map(
            x =>
                x.toString(16)
                    .padStart(8, "0")
        )
        .join("")
        .slice(0, 12)
        .toUpperCase();
}


function setStatus(text) {

    statusText.textContent =
        text;
}


function setFileIcon(file) {

    const type =
        file.type || "";

    if (type.startsWith("image/"))
        return "IMG";

    if (type.startsWith("video/"))
        return "VID";

    if (type.startsWith("audio/"))
        return "AUD";

    if (type.includes("pdf"))
        return "PDF";

    if (type.includes("zip"))
        return "ZIP";

    return "FILE";
}


/* =========================================================
   MODE SWITCHING
========================================================= */

sendModeButton.addEventListener(
    "click",
    () => {

        state.mode = "send";

        sendModeButton.classList.add(
            "active"
        );

        receiveModeButton.classList.remove(
            "active"
        );

        sendPanel.classList.remove(
            "hidden"
        );

        receivePanel.classList.add(
            "hidden"
        );

        stopCamera();

        setStatus("Send mode");
    }
);


receiveModeButton.addEventListener(
    "click",
    () => {

        state.mode = "receive";

        receiveModeButton.classList.add(
            "active"
        );

        sendModeButton.classList.remove(
            "active"
        );

        receivePanel.classList.remove(
            "hidden"
        );

        sendPanel.classList.add(
            "hidden"
        );

        setStatus("Receive mode");
    }
);


/* =========================================================
   FILE SELECTION
========================================================= */

chooseFileButton.addEventListener(
    "click",
    () => {

        fileInput.click();
    }
);


fileInput.addEventListener(
    "change",
    event => {

        const file =
            event.target.files[0];

        if (file) {

            prepareFile(file);
        }
    }
);


/* =========================================================
   DRAG & DROP
========================================================= */

dropZone.addEventListener(
    "dragover",
    event => {

        event.preventDefault();

        dropZone.classList.add(
            "dragover"
        );
    }
);


dropZone.addEventListener(
    "dragleave",
    () => {

        dropZone.classList.remove(
            "dragover"
        );
    }
);


dropZone.addEventListener(
    "drop",
    event => {

        event.preventDefault();

        dropZone.classList.remove(
            "dragover"
        );

        const file =
            event.dataTransfer.files[0];

        if (file) {

            prepareFile(file);
        }
    }
);


/* =========================================================
   PREPARE FILE
========================================================= */

async function prepareFile(file) {

    stopSending();

    state.file = file;

    senderFileName.textContent =
        file.name;

    senderFileSize.textContent =
        humanSize(file.size);

    senderFileType.textContent =
        file.type || "Unknown file type";

    fileTypeIcon.textContent =
        setFileIcon(file);

    senderFileCard.classList.remove(
        "hidden"
    );

    senderConfig.classList.remove(
        "hidden"
    );

    startSendButton.classList.remove(
        "hidden"
    );

    setStatus("File selected");
}


/* =========================================================
   REMOVE FILE
========================================================= */

removeFileButton.addEventListener(
    "click",
    () => {

        resetSender();

        fileInput.value = "";
    }
);


/* =========================================================
   SHA-256
========================================================= */

async function calculateSHA256(buffer) {

    const hashBuffer =
        await crypto.subtle.digest(
            "SHA-256",
            buffer
        );

    const hashArray =
        Array.from(
            new Uint8Array(hashBuffer)
        );

    return hashArray
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
        )
        .join("");
}


/* =========================================================
   ARRAY BUFFER -> BASE64
========================================================= */

function arrayBufferToBase64(buffer) {

    const bytes =
        new Uint8Array(buffer);

    let binary = "";

    const blockSize = 0x8000;

    for (
        let i = 0;
        i < bytes.length;
        i += blockSize
    ) {

        const chunk =
            bytes.subarray(
                i,
                i + blockSize
            );

        binary +=
            String.fromCharCode(
                ...chunk
            );
    }

    return btoa(binary);
}


/* =========================================================
   SPLIT FILE
========================================================= */

function splitBuffer(
    buffer,
    chunkSize
) {

    const chunks = [];

    for (
        let offset = 0;
        offset < buffer.byteLength;
        offset += chunkSize
    ) {

        chunks.push(
            buffer.slice(
                offset,
                Math.min(
                    offset + chunkSize,
                    buffer.byteLength
                )
            )
        );
    }

    return chunks;
}


/* =========================================================
   START SENDING
========================================================= */

startSendButton.addEventListener(
    "click",
    startSending
);


async function startSending() {

    if (!state.file) {

        alert(
            "Please choose a file first."
        );

        return;
    }

    try {

        setStatus(
            "Preparing file..."
        );

        startSendButton.disabled =
            true;

        state.fileData =
            await state.file.arrayBuffer();

        state.fileHash =
            await calculateSHA256(
                state.fileData
            );

        state.chunks =
            splitBuffer(
                state.fileData,
                CONFIG.CHUNK_SIZE
            );

        state.sessionId =
            generateSessionId();

        state.currentFrame = 0;

        state.sending = true;

        state.paused = false;

        senderStream.classList.remove(
            "hidden"
        );

        dropZone.classList.add(
            "hidden"
        );

        senderConfig.classList.add(
            "hidden"
        );

        startSendButton.classList.add(
            "hidden"
        );

        pauseSendButton.textContent =
            "Pause";

        setStatus(
            "Streaming QR frames"
        );

        showNextFrame();

    } catch (error) {

        console.error(error);

        alert(
            "Unable to prepare the file."
        );

        startSendButton.disabled =
            false;
    }
}


/* =========================================================
   CREATE PACKET
========================================================= */

function createPacket(index) {

    const chunk =
        state.chunks[index];

    const packet = {

        app: "YUKTI_QRSTREAM",

        version: 1,

        session:
            state.sessionId,

        filename:
            state.file.name,

        mime:
            state.file.type ||
            "application/octet-stream",

        size:
            state.file.size,

        hash:
            state.fileHash,

        index:
            index,

        total:
            state.chunks.length,

        data:
            arrayBufferToBase64(
                chunk
            )

    };

    return packet;
}


/* =========================================================
   RENDER QR
========================================================= */

function renderQR(packet) {

    qrContainer.innerHTML = "";

    const payload =
        JSON.stringify(packet);

    if (
        typeof QRCode === "undefined"
    ) {

        qrContainer.innerHTML = `
            <div style="
                color:#111;
                text-align:center;
                padding:20px;
                font-weight:bold;
            ">
                QR library is loading...
            </div>
        `;

        return;
    }

    new QRCode(
        qrContainer,
        {
            text: payload,

            width: 410,

            height: 410,

            colorDark: "#000000",

            colorLight: "#ffffff",

            correctLevel:
                QRCode.CorrectLevel.M
        }
    );
}


/* =========================================================
   SHOW NEXT FRAME
========================================================= */

function showNextFrame() {

    if (!state.sending)
        return;

    if (state.paused)
        return;

    if (
        state.currentFrame
        >= state.chunks.length
    ) {

        finishSending();

        return;
    }

    const packet =
        createPacket(
            state.currentFrame
        );

    renderQR(packet);

    const total =
        state.chunks.length;

    const frame =
        state.currentFrame + 1;

    const progress =
        (frame / total) * 100;

    currentFrame.textContent =
        `${frame} / ${total}`;

    senderProgress.style.width =
        `${progress}%`;

    senderProgressText.textContent =
        `${progress.toFixed(1)}%`;

    state.currentFrame++;

    state.timer =
        setTimeout(
            showNextFrame,
            CONFIG.FRAME_INTERVAL
        );
}


/* =========================================================
   PAUSE / RESUME
========================================================= */

pauseSendButton.addEventListener(
    "click",
    () => {

        if (!state.sending)
            return;

        state.paused =
            !state.paused;

        if (state.paused) {

            clearTimeout(
                state.timer
            );

            pauseSendButton.textContent =
                "Resume";

            setStatus(
                "Stream paused"
            );

        } else {

            pauseSendButton.textContent =
                "Pause";

            setStatus(
                "Streaming QR frames"
            );

            showNextFrame();
        }
    }
);


/* =========================================================
   STOP
========================================================= */

stopSendButton.addEventListener(
    "click",
    stopSending
);


function stopSending() {

    state.sending = false;

    state.paused = false;

    clearTimeout(
        state.timer
    );

    senderStream.classList.add(
        "hidden"
    );

    dropZone.classList.remove(
        "hidden"
    );

    senderFileCard.classList.remove(
        "hidden"
    );

    senderConfig.classList.remove(
        "hidden"
    );

    startSendButton.classList.remove(
        "hidden"
    );

    startSendButton.disabled =
        false;

    setStatus("Ready");
}


/* =========================================================
   FINISH SENDING
========================================================= */

function finishSending() {

    state.sending = false;

    clearTimeout(
        state.timer
    );

    setStatus(
        "Transfer stream completed"
    );

    pauseSendButton.textContent =
        "Completed";

    pauseSendButton.disabled =
        true;
}


/* =========================================================
   RESET SENDER
========================================================= */

function resetSender() {

    stopSending();

    state.file = null;

    state.fileData = null;

    state.chunks = [];

    state.fileHash = null;

    state.sessionId = null;

    state.currentFrame = 0;

    senderFileCard.classList.add(
        "hidden"
    );

    senderConfig.classList.add(
        "hidden"
    );

    startSendButton.classList.add(
        "hidden"
    );

    dropZone.classList.remove(
        "hidden"
    );

    qrContainer.innerHTML = "";

    setStatus("Ready");
}


/* =========================================================
   CAMERA
========================================================= */

startCameraButton.addEventListener(
    "click",
    startCamera
);


async function startCamera() {

    if (
        !navigator.mediaDevices
        ||
        !navigator.mediaDevices.getUserMedia
    ) {

        alert(
            "Your browser does not support camera access."
        );

        return;
    }

    try {

        state.cameraStream =
            await navigator.mediaDevices.getUserMedia(
                {
                    video: {
                        facingMode: {
                            ideal: "environment"
                        },

                        width: {
                            ideal: 1280
                        },

                        height: {
                            ideal: 720
                        }
                    },

                    audio: false
                }
            );

        cameraVideo.srcObject =
            state.cameraStream;

        state.scanning = true;

        cameraMessage.textContent =
            "Scanning for QR...";

        startCameraButton.textContent =
            "Camera Active";

        startCameraButton.disabled =
            true;

        setStatus(
            "Camera scanning"
        );

        startQRScanning();

    } catch (error) {

        console.error(error);

        alert(
            "Camera permission was denied or unavailable."
        );
    }
}


/* =========================================================
   STOP CAMERA
========================================================= */

function stopCamera() {

    state.scanning = false;

    if (state.cameraStream) {

        state.cameraStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );

        state.cameraStream = null;
    }

    cameraVideo.srcObject = null;

    startCameraButton.textContent =
        "Start Camera";

    startCameraButton.disabled =
        false;

    cameraMessage.textContent =
        "Camera inactive";
}


/* =========================================================
   QR SCANNING
========================================================= */

async function startQRScanning() {

    /*
     * Browser BarcodeDetector is the cleanest
     * native approach when available.
     */

    if (
        "BarcodeDetector"
        in window
    ) {

        try {

            const supported =
                await BarcodeDetector.getSupportedFormats();

            if (
                supported.includes("qr_code")
            ) {

                scanUsingBarcodeDetector();

                return;
            }

        } catch (error) {

            console.warn(
                "BarcodeDetector unavailable",
                error
            );
        }
    }

    /*
     * Fallback message.
     *
     * A production version should bundle a
     * JavaScript QR decoder such as jsQR locally.
     */

    cameraMessage.textContent =
        "QR scanning is not supported by this browser.";

    receiverState.textContent =
        "Unsupported";

    setStatus(
        "QR scanner unavailable"
    );
}


/* =========================================================
   BARCODE DETECTOR
========================================================= */

async function scanUsingBarcodeDetector() {

    const detector =
        new BarcodeDetector({
            formats: ["qr_code"]
        });

    async function scan() {

        if (!state.scanning)
            return;

        if (
            cameraVideo.readyState
            >= 2
        ) {

            try {

                const codes =
                    await detector.detect(
                        cameraVideo
                    );

                if (
                    codes.length > 0
                ) {

                    const value =
                        codes[0].rawValue;

                    if (value) {

                        processQRPayload(
                            value
                        );
                    }
                }

            } catch (error) {

                console.warn(
                    "QR detection error",
                    error
                );
            }
        }

        requestAnimationFrame(
            scan
        );
    }

    scan();
}


/* =========================================================
   PROCESS QR PAYLOAD
========================================================= */

function processQRPayload(raw) {

    const now =
        Date.now();

    /*
     * Ignore exactly repeated QR
     * for a short period.
     */

    if (
        raw === state.lastPacket
        &&
        now - state.lastPacketTime
            < CONFIG.DUPLICATE_TIMEOUT
    ) {

        return;
    }

    state.lastPacket =
        raw;

    state.lastPacketTime =
        now;

    let packet;

    try {

        packet =
            JSON.parse(raw);

    } catch {

        return;
    }

    if (
        packet.app
        !== "YUKTI_QRSTREAM"
    ) {

        return;
    }

    receivePacket(
        packet
    );
}


/* =========================================================
   RECEIVE PACKET
========================================================= */

function receivePacket(packet) {

    if (
        !Number.isInteger(
            packet.index
        )
    ) {

        return;
    }

    /*
     * New transfer
     */

    if (
        state.receiverSession === null
    ) {

        state.receiverSession =
            packet.session;

        state.receiverMeta = {

            filename:
                packet.filename,

            mime:
                packet.mime,

            size:
                packet.size,

            hash:
                packet.hash,

            total:
                packet.total

        };

        state.receiverPackets =
            new Map();

        receiverFileName.textContent =
            packet.filename;

        receiveStatus.classList.remove(
            "hidden"
        );

        completionBox.classList.add(
            "hidden"
        );

        receiverState.textContent =
            "Receiving";

        setStatus(
            "Receiving file"
        );
    }


    /*
     * Ignore packets from another
     * transfer session.
     */

    if (
        packet.session
        !== state.receiverSession
    ) {

        return;
    }


    /*
     * Ignore duplicate frame.
     */

    if (
        state.receiverPackets.has(
            packet.index
        )
    ) {

        return;
    }


    /*
     * Decode Base64.
     */

    try {

        const binary =
            atob(packet.data);

        const bytes =
            new Uint8Array(
                binary.length
            );

        for (
            let i = 0;
            i < binary.length;
            i++
        ) {

            bytes[i] =
                binary.charCodeAt(i);
        }

        state.receiverPackets.set(
            packet.index,
            bytes
        );

    } catch (error) {

        console.error(
            "Packet decoding failed",
            error
        );

        return;
    }


    updateReceiverUI();


    /*
     * Check whether every frame
     * has arrived.
     */

    if (
        state.receiverPackets.size
        === state.receiverMeta.total
    ) {

        reconstructFile();
    }
}


/* =========================================================
   RECEIVER UI
========================================================= */

function updateReceiverUI() {

    const received =
        state.receiverPackets.size;

    const total =
        state.receiverMeta.total;

    const percent =
        (received / total) * 100;

    receiverFrameText.textContent =
        `${received} / ${total}`;

    receiverProgress.style.width =
        `${percent}%`;

    let bytes = 0;

    for (
        const chunk
        of state.receiverPackets.values()
    ) {

        bytes +=
            chunk.byteLength;
    }

    receiverBytes.textContent =
        humanSize(bytes);


    let missing = 0;

    for (
        let i = 0;
        i < total;
        i++
    ) {

        if (
            !state.receiverPackets.has(i)
        ) {

            missing++;
        }
    }

    missingFrames.textContent =
        missing;


    receiverState.textContent =
        missing === 0
            ? "Complete"
            : "Scanning";
}


/* =========================================================
   RECONSTRUCT FILE
========================================================= */

async function reconstructFile() {

    receiverState.textContent =
        "Verifying";

    setStatus(
        "Verifying file..."
    );


    const chunks = [];

    for (
        let i = 0;
        i < state.receiverMeta.total;
        i++
    ) {

        const chunk =
            state.receiverPackets.get(i);

        if (!chunk) {

            receiverState.textContent =
                "Missing frame";

            return;
        }

        chunks.push(chunk);
    }


    /*
     * Combine chunks.
     */

    const blob =
        new Blob(
            chunks,
            {
                type:
                    state.receiverMeta.mime
            }
        );


    /*
     * Calculate SHA-256.
     */

    const buffer =
        await blob.arrayBuffer();

    const hash =
        await calculateSHA256(
            buffer
        );


    /*
     * Verify.
     */

    if (
        hash
        !== state.receiverMeta.hash
    ) {

        receiverState.textContent =
            "Verification failed";

        setStatus(
            "File verification failed"
        );

        alert(
            "The file was received, but SHA-256 verification failed."
        );

        return;
    }


    /*
     * Success.
     */

    receiverState.textContent =
        "Verified";

    setStatus(
        "Transfer complete"
    );

    const url =
        URL.createObjectURL(
            blob
        );

    downloadButton.href =
        url;

    downloadButton.download =
        state.receiverMeta.filename;

    completionText.textContent =
        `${state.receiverMeta.filename} • ${humanSize(blob.size)}`;

    completionBox.classList.remove(
        "hidden"
    );
}


/* =========================================================
   NEW RECEIVER
========================================================= */

newReceiveButton.addEventListener(
    "click",
    resetReceiver
);


function resetReceiver() {

    state.receiverSession =
        null;

    state.receiverMeta =
        null;

    state.receiverPackets =
        new Map();

    state.lastPacket =
        null;

    state.lastPacketTime =
        0;

    receiveStatus.classList.add(
        "hidden"
    );

    completionBox.classList.add(
        "hidden"
    );

    receiverProgress.style.width =
        "0%";

    receiverFrameText.textContent =
        "0 / 0";

    receiverBytes.textContent =
        "0 KB";

    missingFrames.textContent =
        "0";

    receiverState.textContent =
        "Scanning";

    setStatus(
        "Ready to receive"
    );
}


/* =========================================================
   CLEANUP
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        stopCamera();

        stopSending();
    }
);


/* =========================================================
   INITIAL STATUS
========================================================= */

setStatus(
    "Ready"
);