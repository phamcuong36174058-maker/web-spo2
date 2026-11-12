let chart;
let socket = null;
let simInterval = null;
const MAX_POINTS = 25;

// Khởi tạo biểu đồ
window.onload = () => {
    const ctx = document.getElementById('vitalsChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'SpO2 (%)',
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    data: [],
                    tension: 0.35,
                    fill: true
                },
                {
                    label: 'Nhịp tim (BPM)',
                    borderColor: '#f43f5e',
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    data: [],
                    tension: 0.35,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { min: 40, max: 140, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { labels: { color: '#f8fafc' } } }
        }
    });
};

// Hàm xử lý chuỗi dữ liệu nhận được từ ESP32 (Định dạng: "98,75" hoặc JSON {"spo2":98,"bpm":75})
function parseIncomingData(rawText) {
    const cleanText = rawText.trim();
    if (!cleanText) return;
    document.getElementById('rawLog').textContent = `Dữ liệu thô: ${cleanText}`;

    let spo2 = 0, bpm = 0;

    // Hỗ trợ định dạng JSON: {"spo2":98,"bpm":75}
    if (cleanText.startsWith('{')) {
        try {
            const obj = JSON.parse(cleanText);
            spo2 = Number(obj.spo2);
            bpm = Number(obj.bpm);
        } catch (e) { return; }
    } 
    // Hỗ trợ định dạng CSV đơn giản: "98,75"
    else if (cleanText.includes(',')) {
        const parts = cleanText.split(',');
        spo2 = Number(parts[0]);
        bpm = Number(parts[1]);
    }

    if (spo2 > 0 && bpm > 0) {
        updateUI(spo2, bpm);
    }
}

// Cập nhật giao diện và biểu đồ
function updateUI(spo2, bpm) {
    document.getElementById('spo2Val').textContent = spo2;
    document.getElementById('bpmVal').textContent = bpm;

    const spo2Badge = document.getElementById('spo2Badge');
    spo2Badge.textContent = spo2 >= 95 ? 'Bình thường' : 'Thấp';
    spo2Badge.style.color = spo2 >= 95 ? '#10b981' : '#ef4444';

    const bpmBadge = document.getElementById('bpmBadge');
    bpmBadge.textContent = (bpm >= 60 && bpm <= 100) ? 'Ổn định' : 'Bất thường';
    bpmBadge.style.color = (bpm >= 60 && bpm <= 100) ? '#10b981' : '#f59e0b';

    const timeLabel = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    if (chart.data.labels.length >= MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }
    chart.data.labels.push(timeLabel);
    chart.data.datasets[0].data.push(spo2);
    chart.data.datasets[1].data.push(bpm);
    chart.update('none');
}

// CÁCH 1: KẾT NỐI QUA CÁP USB (WEB SERIAL API)
async function connectSerial() {
    if (!("serial" in navigator)) {
        alert("Trình duyệt của bạn không hỗ trợ Web Serial. Hãy dùng Chrome hoặc Edge!");
        return;
    }
    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 }); // Đảm bảo trùng baudRate với Serial.begin() trên ESP32

        setStatus("Đã kết nối qua Cáp USB", true);

        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        let buffer = "";
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            let lines = buffer.split('\n');
            buffer = lines.pop(); // Giữ lại phần chưa trọn vẹn
            for (let line of lines) {
                parseIncomingData(line);
            }
        }
    } catch (err) {
        console.error(err);
        setStatus("Lỗi / Hủy kết nối USB", false);
    }
}

// CÁCH 2: KẾT NỐI QUA WIFI (WEBSOCKET)
function connectWebSocket() {
    const ip = document.getElementById('espIp').value.trim();
    if (!ip) return alert("Vui lòng nhập IP của ESP32!");

    if (socket) socket.close();
    socket = new WebSocket(`ws://${ip}:81/`);

    socket.onopen = () => setStatus(`Đã kết nối WiFi (${ip})`, true);
    socket.onmessage = (event) => parseIncomingData(event.data);
    socket.onclose = () => setStatus("Mất kết nối WiFi", false);
    socket.onerror = () => setStatus("Lỗi kết nối WiFi", false);
}

// CHẾ ĐỘ CHẠY THỬ DỮ LIỆU GIẢ
function toggleSimulation() {
    const btn = document.getElementById('simBtn');
    if (simInterval) {
        clearInterval(simInterval);
        simInterval = null;
        btn.textContent = "▶ Chạy thử";
        setStatus("Đã dừng chạy thử", false);
    } else {
        setStatus("Đang chạy dữ liệu giả lập", true);
        btn.textContent = "⏹ Dừng thử";
        simInterval = setInterval(() => {
            const fakeSpo2 = Math.floor(Math.random() * (99 - 96 + 1)) + 96;
            const fakeBpm = Math.floor(Math.random() * (85 - 70 + 1)) + 70;
            parseIncomingData(`${fakeSpo2},${fakeBpm}`);
        }, 1000);
    }
}

function setStatus(text, isConnected) {
    const el = document.getElementById('connStatus');
    el.textContent = text;
    el.className = isConnected ? "text-success" : "text-danger";
}