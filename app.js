/* =========================================================
   YUKTI QRSTREAM v2.0
   Reliable Continuous Optical File Transfer
========================================================= */

"use strict";


/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIG = {

    /*
     * Smaller payload = easier camera decoding.
     */
    CHUNK_SIZE: 700,

    /*
     * Approximately 2.4 QR frames/second.
     *
     * Increase to 500-600ms if the phone camera
     * has difficulty decoding.
     */
    FRAME_INTERVAL: 420,

    /*
     * Scanner interval.
     */
    SCAN_INTERVAL: 90,

    /*
     * Send metadata again every N data frames.
     * This makes synchronization much faster.
     */
    META_EVERY: 10,

    /*
     * Application identifier.
     */
    APP: "YUKTI_QRSTREAM",

    VERSION: 2
};


/* =========================================================
   STATE
========================================================= */

const state = {

    mode: "send",

    /* ---------------- Sender ---------------- */

    file: null,

    fileData: null,

    chunks: [],

    fileHash: null,

    sessionId: null,

    currentFrame: 0,

    cycle: 0,

    sending: false,

    paused: false,

    timer: null,

    framesTransmitted: 0,

    transmissionStartedAt: 0,

    /* ---------------- Receiver ---------------- */

    cameraStream: null,

    scanning: false,

    scanTimer: null,

    receiverSession: null,

    receiverMeta: null,

    receiverPackets: new Map(),

    receiverCompleted: false,

    receivedBytes: 0,

    scannedFrames: 0,

    duplicateFrames: 0,

    receiverCycles: new Set(),

    lastRawPacket: null,

    lastRawPacketTime: 0,

    downloadUrl: null
};


/* =========================================================
   DOM
========================================================= */

const $ = id =>
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

const senderCycle =
    $("senderCycle");

const senderSpeed =
    $("senderSpeed");

const senderProgress =
    $("senderProgress");

const senderProgressText =
    $("senderProgressText");

const senderStreamState =
    $("senderStreamState");

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

const scannedFrames =
    $("scannedFrames");

const uniqueFrames =
    $("uniqueFrames");

const duplicateFrames =
    $("duplicateFrames");

const receiverCycles =
    $("receiverCycles");

const receiverSessionText =
    $("receiverSessionText");

const completionBox =
    $("completionBox");

const completionText =
    $("completionText");

const downloadButton =
    $("downloadButton");

const newReceiveButton =
    $("newReceiveButton");

const statusText =
    $("statusText");

const statusDot =
    $("statusDot");


/* =========================================================
   HELPERS
========================================================= */

function humanSize(bytes) {

    if (!Number.isFinite(bytes)) {
        return "0 B";
    }

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(2)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}


function generateSessionId() {

    const random =
        crypto.getRandomValues(
            new Uint32Array(3)
        );

    return Array
        .from(random)
        .map(value =>
            value
                .toString(16)
                .padStart(8, "0")
        )
        .join("")
        .slice(0, 12)
        .toUpperCase();
}


function setStatus(text) {

    if (statusText) {
        statusText.textContent = text;
    }
}


function setStatusOnline() {

    if (!statusDot) {
        return;
    }

    statusDot.style.background =
        "var(--accent)";

    statusDot.style.boxShadow =
        "0 0 12px var(--accent)";
}


function setStatusSuccess() {

    if (!statusDot) {
        return;
    }

    statusDot.style.background =
        "var(--success)";

    statusDot.style.boxShadow =
        "0 0 12px var(--success)";
}


function setStatusDanger() {

    if (!statusDot) {
        return;
    }

    statusDot.style.background =
        "var(--danger)";

    statusDot.style.boxShadow =
        "0 0 12px var(--danger)";
}


function setFileIcon(file) {

    const type =
        file.type || "";

    if (type.startsWith("image/")) {
        return "IMG";
    }

    if (type.startsWith("video/")) {
        return "VID";
    }

    if (type.startsWith("audio/")) {
        return "AUD";
    }

    if (type.includes("pdf")) {
        return "PDF";
    }

    if (
        type.includes("zip") ||
        type.includes("compressed")
    ) {
        return "ZIP";
    }

    if (
        type.includes("text") ||
        type.includes("json")
    ) {
        return "TXT";
    }

    return "FILE";
}


/* =========================================================
   BASE64
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


function base64ToUint8Array(base64) {

    const binary =
        atob(base64);

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

    return bytes;
}


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
        .map(byte =>
            byte
                .toString(16)
                .padStart(2, "0")
        )
        .join("");
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

    /*
     * Empty files need one chunk.
     */
    if (chunks.length === 0) {
        chunks.push(
            new ArrayBuffer(0)
        );
    }

    return chunks;
}


/* =========================================================
   MODE SWITCH
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

        setStatusOnline();
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

        setStatusOnline();
    }
);


/* =========================================================
   FILE PICKER
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

function prepareFile(file) {

    stopSending();

    state.file = file;

    senderFileName.textContent =
        file.name;

    senderFileSize.textContent =
        humanSize(file.size);

    senderFileType.textContent =
        file.type ||
        "application/octet-stream";

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

    setStatus(
        "File selected"
    );

    setStatusOnline();
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
   CREATE METADATA PACKET
========================================================= */

function createMetaPacket() {

    return {

        app: CONFIG.APP,

        version: CONFIG.VERSION,

        type: "meta",

        session:
            state.sessionId,

        filename:
            state.file.name,

        mime:
            state.file.type ||
            "application/octet-stream",

        size:
            state.file.size,

        total:
            state.chunks.length,

        chunkSize:
            CONFIG.CHUNK_SIZE,

        hash:
            state.fileHash
    };
}


/* =========================================================
   CREATE CHUNK PACKET
========================================================= */

function createChunkPacket(index) {

    const chunk =
        state.chunks[index];

    return {

        app: CONFIG.APP,

        version: CONFIG.VERSION,

        type: "chunk",

        session:
            state.sessionId,

        index,

        total:
            state.chunks.length,

        cycle:
            state.cycle,

        data:
            arrayBufferToBase64(
                chunk
            )
    };
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

        /*
         * Read file.
         */
        state.fileData =
            await state.file.arrayBuffer();

        /*
         * Calculate integrity hash.
         */
        state.fileHash =
            await calculateSHA256(
                state.fileData
            );

        /*
         * Split into small chunks.
         */
        state.chunks =
            splitBuffer(
                state.fileData,
                CONFIG.CHUNK_SIZE
            );

        /*
         * New session.
         */
        state.sessionId =
            generateSessionId();

        /*
         * Reset stream.
         */
        state.currentFrame = 0;

        state.cycle = 1;

        state.framesTransmitted = 0;

        state.transmissionStartedAt =
            Date.now();

        state.sending = true;

        state.paused = false;

        /*
         * UI.
         */
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

        pauseSendButton.disabled =
            false;

        pauseSendButton.textContent =
            "Pause";

        senderProgress.style.width =
            "0%";

        senderProgressText.textContent =
            "0%";

        senderCycle.textContent =
            "1";

        senderStreamState.textContent =
            "Synchronizing...";

        currentFrame.textContent =
            `0 / ${state.chunks.length}`;

        setStatus(
            "QR stream active"
        );

        setStatusOnline();

        /*
         * Begin continuous transmission.
         */
        showNextFrame();

    } catch (error) {

        console.error(
            "Send preparation error:",
            error
        );

        alert(
            "Unable to prepare the file."
        );

        startSendButton.disabled =
            false;
    }
}


/* =========================================================
   RENDER QR
========================================================= */

function renderQR(packet) {

    qrContainer.innerHTML = "";

    if (
        typeof QRCode ===
        "undefined"
    ) {

        qrContainer.innerHTML = `
            <div style="
                color:#111;
                text-align:center;
                padding:20px;
                font-weight:bold;
            ">
                QR generator is loading...
            </div>
        `;

        return;
    }

    const payload =
        JSON.stringify(packet);

    try {

        new QRCode(
            qrContainer,
            {

                text:
                    payload,

                width:
                    410,

                height:
                    410,

                colorDark:
                    "#000000",

                colorLight:
                    "#ffffff",

                correctLevel:
                    QRCode.CorrectLevel.M
            }
        );

    } catch (error) {

        console.error(
            "QR generation error:",
            error
        );
    }
}


/* =========================================================
   CONTINUOUS STREAM
========================================================= */

function showNextFrame() {

    if (!state.sending) {
        return;
    }

    if (state.paused) {
        return;
    }

    const total =
        state.chunks.length;

    /*
     * -------------------------------------------------------
     * END OF CURRENT CYCLE
     * -------------------------------------------------------
     *
     * IMPORTANT:
     *
     * We DO NOT stop here.
     *
     * We start another cycle.
     */

    if (
        state.currentFrame >=
        total
    ) {

        state.currentFrame = 0;

        state.cycle++;

        senderCycle.textContent =
            state.cycle;
    }


    /*
     * -------------------------------------------------------
     * METADATA
     * -------------------------------------------------------
     *
     * Metadata is shown:
     *
     * 1. At the beginning of every cycle.
     * 2. Every META_EVERY frames.
     *
     * This helps a receiver join late.
     */

    const shouldSendMeta =
        state.currentFrame === 0 ||
        state.currentFrame %
            CONFIG.META_EVERY === 0;


    let packet;

    if (shouldSendMeta) {

        packet =
            createMetaPacket();

        /*
         * Add cycle information.
         */
        packet.cycle =
            state.cycle;

    } else {

        packet =
            createChunkPacket(
                state.currentFrame
            );
    }


    /*
     * Render QR.
     */

    renderQR(packet);


    /*
     * Frame UI.
     */

    const displayFrame =
        state.currentFrame + 1;

    currentFrame.textContent =
        `${displayFrame} / ${total}`;

    /*
     * This progress is ONLY sender
     * cycle progress.
     *
     * It does NOT mean receiver progress.
     */

    const progress =
        (state.currentFrame / total) *
        100;

    senderProgress.style.width =
        `${progress}%`;

    senderProgressText.textContent =
        `${progress.toFixed(1)}%`;


    /*
     * Transmission statistics.
     */

    state.framesTransmitted++;

    const elapsed =
        Math.max(
            1,
            (Date.now() -
                state.transmissionStartedAt) /
                1000
        );

    const fps =
        state.framesTransmitted /
        elapsed;

    senderSpeed.textContent =
        `${fps.toFixed(1)} FPS`;

    senderStreamState.textContent =
        `Streaming · Cycle ${state.cycle}`;


    /*
     * Move to next chunk.
     */

    state.currentFrame++;


    /*
     * Schedule next QR.
     */

    clearTimeout(
        state.timer
    );

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

        if (!state.sending) {
            return;
        }

        state.paused =
            !state.paused;

        if (state.paused) {

            clearTimeout(
                state.timer
            );

            pauseSendButton.textContent =
                "Resume";

            senderStreamState.textContent =
                "Paused";

            setStatus(
                "QR stream paused"
            );

        } else {

            pauseSendButton.textContent =
                "Pause";

            senderStreamState.textContent =
                "Streaming";

            setStatus(
                "QR stream active"
            );

            showNextFrame();
        }
    }
);


/* =========================================================
   STOP SENDING
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

    state.timer = null;

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

    if (state.file) {

        startSendButton.classList.remove(
            "hidden"
        );

        startSendButton.disabled =
            false;
    }

    pauseSendButton.disabled =
        false;

    pauseSendButton.textContent =
        "Pause";

    setStatus(
        "Ready"
    );

    setStatusOnline();
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

    state.cycle = 0;

    state.framesTransmitted = 0;

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

    currentFrame.textContent =
        "0 / 0";

    senderCycle.textContent =
        "0";

    senderProgress.style.width =
        "0%";

    senderProgressText.textContent =
        "0%";

    setStatus(
        "Ready"
    );
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
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        alert(
            "Camera access is not supported by this browser."
        );

        return;
    }

    /*
     * jsQR must be available.
     */

    if (
        typeof jsQR !==
        "function"
    ) {

        alert(
            "QR scanner is still loading. Please try again."
        );

        return;
    }

    try {

        stopCamera();

        state.cameraStream =
            await navigator.mediaDevices
                .getUserMedia(
                    {

                        video: {

                            facingMode: {
                                ideal:
                                    "environment"
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

        await cameraVideo.play();

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

        setStatusOnline();

        /*
         * Reset completion UI only.
         * We intentionally do NOT erase a valid
         * receiver session here unless newReceive
         * is clicked.
         */

        startQRScanning();

    } catch (error) {

        console.error(
            "Camera error:",
            error
        );

        setStatusDanger();

        setStatus(
            "Camera unavailable"
        );

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

    clearTimeout(
        state.scanTimer
    );

    state.scanTimer = null;

    if (state.cameraStream) {

        state.cameraStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );

        state.cameraStream = null;
    }

    cameraVideo.srcObject =
        null;

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

function startQRScanning() {

    if (!state.scanning) {
        return;
    }

    if (
        cameraVideo.readyState < 2
    ) {

        state.scanTimer =
            setTimeout(
                startQRScanning,
                150
            );

        return;
    }

    try {

        const width =
            cameraVideo.videoWidth;

        const height =
            cameraVideo.videoHeight;

        if (
            !width ||
            !height
        ) {

            state.scanTimer =
                setTimeout(
                    startQRScanning,
                    150
                );

            return;
        }

        /*
         * Match canvas to camera.
         */

        if (
            cameraCanvas.width !== width ||
            cameraCanvas.height !== height
        ) {

            cameraCanvas.width =
                width;

            cameraCanvas.height =
                height;
        }

        const context =
            cameraCanvas.getContext(
                "2d",
                {
                    willReadFrequently: true
                }
            );

        /*
         * Draw current camera frame.
         */

        context.drawImage(
            cameraVideo,
            0,
            0,
            width,
            height
        );

        const imageData =
            context.getImageData(
                0,
                0,
                width,
                height
            );


        /*
         * Decode QR.
         */

        const code =
            jsQR(
                imageData.data,
                imageData.width,
                imageData.height,
                {
                    inversionAttempts:
                        "attemptBoth"
                }
            );


        if (
            code &&
            code.data
        ) {

            processQRPayload(
                code.data
            );
        }

    } catch (error) {

        console.warn(
            "Scanner error:",
            error
        );
    }


    /*
     * Continue scanning.
     */

    if (state.scanning) {

        state.scanTimer =
            setTimeout(
                startQRScanning,
                CONFIG.SCAN_INTERVAL
            );
    }
}


/* =========================================================
   PROCESS QR PAYLOAD
========================================================= */

function processQRPayload(raw) {

    if (
        typeof raw !==
        "string"
    ) {
        return;
    }

    state.scannedFrames++;

    updateReceiverStats();


    /*
     * Prevent processing the exact same QR
     * multiple times while the camera is still
     * looking at it.
     *
     * IMPORTANT:
     *
     * We still allow the same chunk again
     * in a later cycle.
     */

    const now =
        Date.now();

    if (
        raw === state.lastRawPacket &&
        now -
            state.lastRawPacketTime <
            350
    ) {

        return;
    }

    state.lastRawPacket =
        raw;

    state.lastRawPacketTime =
        now;


    let packet;

    try {

        packet =
            JSON.parse(raw);

    } catch {

        return;
    }


    /*
     * Validate application.
     */

    if (
        packet.app !==
        CONFIG.APP
    ) {
        return;
    }


    if (
        packet.version !==
        CONFIG.VERSION
    ) {
        return;
    }


    /*
     * Route packet.
     */

    if (
        packet.type ===
        "meta"
    ) {

        receiveMeta(
            packet
        );

        return;
    }


    if (
        packet.type ===
        "chunk"
    ) {

        receiveChunk(
            packet
        );

        return;
    }
}


/* =========================================================
   RECEIVE METADATA
========================================================= */

function receiveMeta(packet) {

    /*
     * Validate required fields.
     */

    if (
        !packet.session ||
        !packet.filename ||
        !Number.isInteger(packet.total) ||
        packet.total < 1
    ) {
        return;
    }


    /*
     * -------------------------------------------------------
     * NEW SESSION
     * -------------------------------------------------------
     */

    if (
        state.receiverSession !==
        packet.session
    ) {

        /*
         * If an old transfer was active,
         * start a completely new receiver.
         */

        state.receiverSession =
            packet.session;

        state.receiverMeta = {

            filename:
                packet.filename,

            mime:
                packet.mime ||
                "application/octet-stream",

            size:
                Number(packet.size) || 0,

            total:
                packet.total,

            chunkSize:
                packet.chunkSize ||
                CONFIG.CHUNK_SIZE,

            hash:
                packet.hash,

            cycle:
                packet.cycle || 1
        };


        /*
         * Clear previous chunks.
         */

        state.receiverPackets =
            new Map();

        state.receivedBytes = 0;

        state.receiverCompleted =
            false;

        state.receiverCycles =
            new Set();

        /*
         * Hide previous completion.
         */

        completionBox.classList.add(
            "hidden"
        );


        /*
         * Show receiver state.
         */

        receiveStatus.classList.remove(
            "hidden"
        );


        receiverFileName.textContent =
            packet.filename;

        receiverSessionText.textContent =
            `SESSION ${packet.session}`;


        receiverState.textContent =
            "Synchronized";

        receiverFrameText.textContent =
            `0 / ${packet.total}`;

        receiverProgress.style.width =
            "0%";

        receiverBytes.textContent =
            "0 KB";

        missingFrames.textContent =
            packet.total;

        setStatus(
            "Receiver synchronized"
        );

        setStatusOnline();
    }


    /*
     * Existing session.
     */

    if (
        packet.session ===
        state.receiverSession
    ) {

        if (
            Number.isInteger(
                packet.cycle
            )
        ) {

            state.receiverCycles.add(
                packet.cycle
            );
        }

        updateReceiverStats();
    }
}


/* =========================================================
   RECEIVE CHUNK
========================================================= */

function receiveChunk(packet) {

    /*
     * We cannot accept chunks before metadata.
     */

    if (
        !state.receiverMeta ||
        !state.receiverSession
    ) {
        return;
    }


    /*
     * Wrong session.
     */

    if (
        packet.session !==
        state.receiverSession
    ) {
        return;
    }


    /*
     * Validate index.
     */

    if (
        !Number.isInteger(
            packet.index
        )
    ) {
        return;
    }


    if (
        packet.index < 0 ||
        packet.index >=
            state.receiverMeta.total
    ) {
        return;
    }


    /*
     * Track cycle.
     */

    if (
        Number.isInteger(
            packet.cycle
        )
    ) {

        state.receiverCycles.add(
            packet.cycle
        );
    }


    /*
     * -------------------------------------------------------
     * DUPLICATE DETECTION
     * -------------------------------------------------------
     */

    if (
        state.receiverPackets.has(
            packet.index
        )
    ) {

        state.duplicateFrames++;

        updateReceiverStats();

        return;
    }


    /*
     * Decode chunk.
     */

    let bytes;

    try {

        bytes =
            base64ToUint8Array(
                packet.data
            );

    } catch {

        return;
    }


    /*
     * Store by INDEX.
     *
     * This is the important synchronization mechanism.
     *
     * Example:
     *
     * Received:
     * 0,1,2,4,5,8
     *
     * Map stores exactly those indexes.
     *
     * When 3,6,7 arrive later, the Map becomes complete.
     */

    state.receiverPackets.set(
        packet.index,
        bytes
    );


    state.receivedBytes +=
        bytes.byteLength;


    updateReceiverProgress();


    /*
     * Check completion.
     */

    if (
        state.receiverPackets.size ===
        state.receiverMeta.total
    ) {

        completeReceive();
    }
}


/* =========================================================
   RECEIVER PROGRESS
========================================================= */

function updateReceiverProgress() {

    if (!state.receiverMeta) {
        return;
    }

    const total =
        state.receiverMeta.total;

    const received =
        state.receiverPackets.size;

    const progress =
        (received / total) * 100;


    receiverFrameText.textContent =
        `${received} / ${total}`;


    receiverProgress.style.width =
        `${progress}%`;


    receiverBytes.textContent =
        humanSize(
            state.receivedBytes
        );


    missingFrames.textContent =
        Math.max(
            0,
            total - received
        );


    uniqueFrames.textContent =
        received;


    receiverState.textContent =
        received === total
            ? "Verifying"
            : "Collecting";


    /*
     * Important:
     *
     * The receiver's progress is the REAL
     * transfer progress.
     *
     * Sender's progress is only current-cycle
     * position.
     */
}


/* =========================================================
   RECEIVER STATS
========================================================= */

function updateReceiverStats() {

    scannedFrames.textContent =
        state.scannedFrames;

    uniqueFrames.textContent =
        state.receiverPackets.size;

    duplicateFrames.textContent =
        state.duplicateFrames;

    receiverCycles.textContent =
        state.receiverCycles.size;

    if (
        state.receiverMeta
    ) {

        missingFrames.textContent =
            Math.max(
                0,
                state.receiverMeta.total -
                state.receiverPackets.size
            );
    }
}


/* =========================================================
   COMPLETE RECEIVE
========================================================= */

async function completeReceive() {

    /*
     * Prevent duplicate completion attempts.
     */

    if (
        state.receiverCompleted
    ) {
        return;
    }

    state.receiverCompleted =
        true;

    receiverState.textContent =
        "Verifying";

    setStatus(
        "Verifying received file..."
    );


    try {

        const total =
            state.receiverMeta.total;

        /*
         * Build ordered chunks.
         */

        const orderedChunks = [];

        let totalBytes = 0;


        for (
            let i = 0;
            i < total;
            i++
        ) {

            const chunk =
                state.receiverPackets.get(
                    i
                );


            /*
             * This should never happen because
             * Map.size === total, but keep the
             * safety check.
             */

            if (!chunk) {

                state.receiverCompleted =
                    false;

                receiverState.textContent =
                    "Recovering";

                return;
            }


            orderedChunks.push(
                chunk
            );

            totalBytes +=
                chunk.byteLength;
        }


        /*
         * Combine chunks.
         */

        const completeBuffer =
            new Uint8Array(
                totalBytes
            );


        let offset = 0;


        for (
            const chunk
            of orderedChunks
        ) {

            completeBuffer.set(
                chunk,
                offset
            );

            offset +=
                chunk.byteLength;
        }


        /*
         * SHA-256 verification.
         */

        const actualHash =
            await calculateSHA256(
                completeBuffer.buffer
            );


        /*
         * Hash mismatch means we DO NOT
         * declare success.
         */

        if (
            actualHash.toLowerCase() !==
            String(
                state.receiverMeta.hash
            ).toLowerCase()
        ) {

            state.receiverCompleted =
                false;

            receiverState.textContent =
                "Recovering";

            setStatusDanger();

            setStatus(
                "Integrity mismatch — continuing recovery"
            );

            /*
             * Keep scanning.
             *
             * The sender is still repeating.
             */

            return;
        }


        /*
         * ---------------------------------------------------
         * SUCCESS
         * ---------------------------------------------------
         */

        const blob =
            new Blob(
                [completeBuffer],
                {
                    type:
                        state.receiverMeta.mime
                }
            );


        /*
         * Revoke old download URL.
         */

        if (
            state.downloadUrl
        ) {

            URL.revokeObjectURL(
                state.downloadUrl
            );
        }


        state.downloadUrl =
            URL.createObjectURL(
                blob
            );


        /*
         * Download link.
         */

        downloadButton.href =
            state.downloadUrl;

        downloadButton.download =
            state.receiverMeta.filename;


        /*
         * Completion UI.
         */

        completionText.textContent =
            `${state.receiverMeta.filename} · ${humanSize(totalBytes)} · ${state.receiverPackets.size}/${total} frames verified.`;


        completionBox.classList.remove(
            "hidden"
        );


        receiverState.textContent =
            "COMPLETE";


        receiverProgress.style.width =
            "100%";


        receiverFrameText.textContent =
            `${total} / ${total}`;


        missingFrames.textContent =
            "0";


        setStatusSuccess();

        setStatus(
            "Transfer complete"
        );


        /*
         * We can stop the receiver scanner
         * because the file is verified.
         */

        stopCamera();


    } catch (error) {

        console.error(
            "Completion error:",
            error
        );

        state.receiverCompleted =
            false;

        receiverState.textContent =
            "Recovering";

        setStatusDanger();

        setStatus(
            "Verification failed — recovering"
        );
    }
}


/* =========================================================
   NEW RECEIVE
========================================================= */

newReceiveButton.addEventListener(
    "click",
    resetReceiver
);


function resetReceiver() {

    /*
     * Stop camera first.
     */

    stopCamera();


    /*
     * Clear receiver state.
     */

    state.receiverSession =
        null;

    state.receiverMeta =
        null;

    state.receiverPackets =
        new Map();

    state.receiverCompleted =
        false;

    state.receivedBytes =
        0;

    state.scannedFrames =
        0;

    state.duplicateFrames =
        0;

    state.receiverCycles =
        new Set();

    state.lastRawPacket =
        null;

    state.lastRawPacketTime =
        0;


    /*
     * Revoke old download URL.
     */

    if (
        state.downloadUrl
    ) {

        URL.revokeObjectURL(
            state.downloadUrl
        );

        state.downloadUrl =
            null;
    }


    /*
     * Reset UI.
     */

    completionBox.classList.add(
        "hidden"
    );

    receiveStatus.classList.add(
        "hidden"
    );

    receiverFileName.textContent =
        "Waiting for sender...";

    receiverFrameText.textContent =
        "0 / 0";

    receiverProgress.style.width =
        "0%";

    receiverBytes.textContent =
        "0 KB";

    missingFrames.textContent =
        "—";

    receiverState.textContent =
        "Waiting";

    scannedFrames.textContent =
        "0";

    uniqueFrames.textContent =
        "0";

    duplicateFrames.textContent =
        "0";

    receiverCycles.textContent =
        "0";

    receiverSessionText.textContent =
        "Waiting for session...";


    setStatus(
        "Ready to receive"
    );

    setStatusOnline();
}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setStatus(
            "Ready"
        );

        setStatusOnline();

        console.log(
            "YUKTI QRStream v2.0 initialized."
        );

        console.log(
            "Continuous retransmission:",
            true
        );

        console.log(
            "Chunk size:",
            CONFIG.CHUNK_SIZE
        );

        console.log(
            "Frame interval:",
            CONFIG.FRAME_INTERVAL
        );
    }
);


/* =========================================================
   PAGE VISIBILITY
========================================================= */

/*
 * If the browser temporarily hides the page,
 * timers can become unreliable.
 *
 * We don't destroy the sender state.
 */

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.hidden &&
            state.sending
        ) {

            console.log(
                "YUKTI QRStream: page hidden."
            );

        } else if (
            !document.hidden &&
            state.sending &&
            !state.paused
        ) {

            /*
             * Make sure sender resumes its
             * continuous loop.
             */

            clearTimeout(
                state.timer
            );

            showNextFrame();
        }
    }
);