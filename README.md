# YUKTI QRStream

### Offline Optical File Sharing Through Continuous QR Streaming

> **Turn a screen into a data transmitter.**
> Share files device-to-device using continuously changing QR codes — without Bluetooth, Wi-Fi network, hotspot, or internet.

---

## 🚀 Overview

**YUKTI QRStream** is an experimental offline file-sharing system that uses a screen and camera as an **optical communication channel**.

Instead of transferring a file through Bluetooth, Wi-Fi, mobile data, or cloud services, the file is divided into small data chunks. Each chunk is encoded into a QR code and displayed sequentially on the sender's screen.

The receiving device scans these QR frames through its camera, reconstructs the original data, verifies its integrity, and provides the recovered file for download.

```text
             SENDER DEVICE
                  │
                  │
            Select a File
                  │
                  ▼
            Split into Chunks
                  │
                  ▼
          Encode Each Chunk
                  │
                  ▼
       ┌─────────────────────┐
       │  QR Frame 1         │
       │  QR Frame 2         │
       │  QR Frame 3         │
       │  QR Frame ...       │
       └─────────────────────┘
                  │
                  │  Optical Signal
                  ▼
             📷 CAMERA
                  │
                  ▼
          Decode QR Frames
                  │
                  ▼
        Reconstruct File Data
                  │
                  ▼
          SHA-256 Verification
                  │
                  ▼
            Download File
```

---

## ✨ Key Features

### 📤 File Sending

* Select photos, videos, audio, documents, or other files.
* Automatically divide large files into smaller chunks.
* Convert chunks into QR-compatible packets.
* Continuously stream QR codes on the screen.

### 📷 Optical Receiving

* Use the device camera to scan the QR stream.
* Automatically decode incoming QR frames.
* Detect duplicate frames.
* Track received chunks.
* Reconstruct the original file.

### 🔐 Data Integrity

Every transfer can be associated with a session and verified using a **SHA-256 checksum**.

This allows the receiver to confirm that the reconstructed file matches the original file.

### 🌐 No Traditional Network Required

The QR transmission channel itself does not require:

* ❌ Internet
* ❌ Mobile data
* ❌ Bluetooth
* ❌ Wi-Fi router
* ❌ Wi-Fi hotspot

The physical communication channel is:

**Screen → Light → Camera**

---

## 🧠 How QRStream Works

YUKTI QRStream treats a QR code as a small optical data packet rather than simply a visual label.

Suppose a file contains:

```text
FILE
 ↓
Binary Data
 ↓
Chunking
 ↓
Chunk 001
Chunk 002
Chunk 003
...
Chunk N
 ↓
Packet Encoding
 ↓
QR Generation
 ↓
Screen Animation
```

The receiver performs the reverse operation:

```text
Camera
 ↓
QR Detection
 ↓
Packet Decoding
 ↓
Chunk Identification
 ↓
Duplicate Filtering
 ↓
Chunk Reassembly
 ↓
Binary File
 ↓
SHA-256 Verification
 ↓
Recovered File
```

---

## 🔄 Transfer Protocol

Each QR frame contains structured information rather than raw file data alone.

A conceptual packet can contain:

```json
{
  "session": "A7F92C",
  "index": 12,
  "total": 240,
  "data": "BASE64_ENCODED_CHUNK"
}
```

### Packet Fields

| Field     | Purpose                         |
| --------- | ------------------------------- |
| `session` | Identifies the current transfer |
| `index`   | Identifies the current chunk    |
| `total`   | Total number of chunks          |
| `data`    | Encoded file data               |

This allows the receiver to determine:

* Which transfer the frame belongs to
* Which chunk was received
* How many chunks are expected
* Whether a frame is duplicated

---

## 📊 Transfer Example

For a file divided into 100 chunks:

```text
QR #001 → Chunk 001
QR #002 → Chunk 002
QR #003 → Chunk 003
...
QR #100 → Chunk 100
```

If the camera receives:

```text
001
002
003
003
004
005
...
```

The duplicate `003` can be ignored.

The receiver continues collecting unique chunks until the complete file is available.

---

## 🛡️ Integrity Verification

After reconstruction, YUKTI QRStream can calculate the SHA-256 hash of the received file.

```text
Original File
      │
      ▼
 SHA-256
      │
      ▼
Original Hash
      │
      │
      │       Received File
      │            │
      │            ▼
      │         SHA-256
      │            │
      ▼            ▼
      └──── Compare ────┘
              │
        ┌─────┴─────┐
        │           │
      Match      Mismatch
        │           │
        ▼           ▼
    Transfer     Corrupted /
    Verified     Incomplete
```

This helps detect incomplete or corrupted transfers.

---

## 🎯 Why QR Streaming?

Traditional file-sharing methods usually depend on some form of electronic communication:

| Method             | Internet |   Wi-Fi | Bluetooth | Optical |
| ------------------ | -------: | ------: | --------: | ------: |
| Cloud Sharing      |        ✅ | Usually |         ❌ |       ❌ |
| Bluetooth          |        ❌ |       ❌ |         ✅ |       ❌ |
| Wi-Fi Sharing      |        ❌ |       ✅ |         ❌ |       ❌ |
| USB                |        ❌ |       ❌ |         ❌ |       ❌ |
| **YUKTI QRStream** |        ❌ |       ❌ |         ❌ |       ✅ |

QRStream explores a different communication model:

> **Data encoded as light and transmitted through a camera.**

---

## 🏗️ Architecture

```text
┌──────────────────────────────────────────┐
│              YUKTI QRStream              │
└──────────────────────────────────────────┘

                 SENDER
                   │
        ┌──────────▼──────────┐
        │     File Selector   │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │    File Reader      │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Chunking Engine    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Packet Generator    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │    QR Generator     │
        └──────────┬──────────┘
                   │
                   ▼
             📺 SCREEN
                   │
             OPTICAL CHANNEL
                   │
                   ▼
             📷 CAMERA
                   │
        ┌──────────▼──────────┐
        │    QR Decoder       │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Duplicate Filter    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Chunk Reassembler  │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ SHA-256 Validator   │
        └──────────┬──────────┘
                   │
                   ▼
             📁 FILE OUTPUT
```

---

## 💻 Technology Stack

### Frontend

* HTML5
* CSS3
* Vanilla JavaScript
* Web Crypto API
* Browser Camera API

### QR Processing

* QR code generation
* QR frame streaming
* Camera-based QR detection
* Chunk identification and reconstruction

### Browser APIs

```text
File API
   │
   ├── FileReader
   │
   ├── Blob
   │
   └── ArrayBuffer

Camera
   │
   └── MediaDevices API

Security
   │
   └── Web Crypto API
```

---

## 📁 Project Structure

```text
File_Qr_Trans/
│
├── index.html
├── style.css
├── app.js
│
└── README.md
```

### `index.html`

Contains the application structure, interface, file controls, sender panel, receiver panel, and transfer controls.

### `style.css`

Provides the visual design, responsive layout, animations, cards, buttons, QR display area, and progress indicators.

### `app.js`

Handles:

* File selection
* File chunking
* Packet creation
* QR generation
* QR streaming
* Camera access
* QR decoding
* Duplicate detection
* File reconstruction
* SHA-256 verification
* Download generation

---

## ▶️ Running the Project

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/File_Qr_Trans.git
```

### 2. Open the Project

```bash
cd File_Qr_Trans
```

### 3. Run the Application

Because browser camera access works best in a secure context, run the project using a local development server.

For example, with VS Code, use **Live Server**.

Or with Python:

```bash
python -m http.server 5500
```

Then open:

```text
http://localhost:5500
```

---

## 📱 Using YUKTI QRStream

### Sender

1. Open YUKTI QRStream.
2. Select **Send**.
3. Choose the file.
4. Start the QR stream.
5. Keep the QR display visible.
6. Point the receiver camera toward the QR stream.

### Receiver

1. Open YUKTI QRStream.
2. Select **Receive**.
3. Allow camera permission.
4. Point the camera at the sender's QR stream.
5. Keep the camera stable.
6. Wait for all frames to be collected.
7. The application reconstructs and verifies the file.
8. Download the recovered file.

---

## ⚡ Performance Considerations

QR codes have limited data capacity, so large files require many QR frames.

For example:

```text
Small File
   ↓
Few QR Frames
   ↓
Fast Transfer
```

Whereas:

```text
Large Video
   ↓
Many Data Chunks
   ↓
Hundreds / Thousands of QR Frames
   ↓
Longer Transfer Time
```

Transfer speed depends on:

* QR payload size
* QR complexity
* Screen resolution
* Camera quality
* Camera focus
* Lighting
* Distance between devices
* QR frame rate
* Decoder performance
* Missed frames

---

## 🧪 Current Prototype Status

YUKTI QRStream is currently an **experimental prototype** exploring optical file transmission using continuously changing QR codes.

### Implemented

* [x] Modern YUKTI interface
* [x] Send / Receive modes
* [x] File selection
* [x] File chunking
* [x] QR generation
* [x] Continuous QR streaming
* [x] Camera access
* [x] QR frame processing
* [x] Duplicate frame handling
* [x] File reconstruction
* [x] SHA-256 verification
* [x] File download

### Planned Improvements

* [ ] More robust QR decoding across browsers
* [ ] Automatic missing-frame detection
* [ ] Error correction / recovery
* [ ] Fountain-code based transmission
* [ ] End-to-end encryption
* [ ] Adaptive QR frame rate
* [ ] Better large-file optimization
* [ ] Transfer pause/resume
* [ ] Transfer statistics
* [ ] Native mobile application
* [ ] Improved low-light performance

---

## 🔐 Security & Privacy

YUKTI QRStream is designed around local, direct optical transmission.

The conceptual transfer path is:

```text
Sender Screen
      ↓
    Light
      ↓
Receiver Camera
      ↓
Receiver Device
```

There is no requirement for a cloud server to carry the file itself.

For sensitive files, future versions can add **client-side encryption before chunking**, so the QR stream carries encrypted data rather than the original file contents.

---

## ⚠️ Important Technical Limitation

QR codes are not inherently a high-speed file-transfer protocol.

The system works by creating a **sequence of QR frames**, meaning the camera must successfully capture enough frames to reconstruct the file.

Therefore, QRStream is especially interesting for:

* Offline environments
* Demonstrations
* Emergency communication concepts
* Air-gapped environments
* Short-to-medium files
* Experimental optical communication
* Educational projects

For very large files, conventional wired or wireless transfer technologies will generally be more efficient.

---

## 🌟 Future Vision

YUKTI QRStream can evolve from a simple QR animation into a complete **optical communication protocol**.

A future protocol could use:

```text
Data
 ↓
Compression
 ↓
Encryption
 ↓
Chunking
 ↓
Error-Correction Coding
 ↓
Fountain / Erasure Coding
 ↓
QR Encoding
 ↓
Optical Transmission
 ↓
Camera Capture
 ↓
QR Decoding
 ↓
Error Recovery
 ↓
Decryption
 ↓
File Reconstruction
```

This would allow the system to tolerate missed QR frames instead of requiring every individual frame to be captured.

---

## 💡 Innovation

The core idea behind YUKTI QRStream is simple:

> **If a screen can display information and a camera can see it, they can potentially communicate without a conventional network.**

YUKTI QRStream explores this idea by converting a digital file into a sequence of machine-readable visual signals.

**Screen → QR → Light → Camera → Data**

---

## 📌 Project Name

**YUKTI QRStream**

### Tagline

> **Turn a screen into a data transmitter.**

### Category

**Offline File Transfer · Optical Communication · QR Technology · Web Application**

---

## 👨‍💻 Author

**Nilesh Swain**

Computer Science & Engineering
GIFT Autonomous College

---

## ⭐ Support the Project

If you find **YUKTI QRStream** interesting:

* ⭐ Star the repository
* 🍴 Fork the project
* 🐛 Report issues
* 💡 Suggest improvements
* 🔧 Contribute to the project

---

## 📄 License

This project is intended for educational, experimental, and research purposes.

Add an appropriate open-source license to the repository before distributing the project publicly.
