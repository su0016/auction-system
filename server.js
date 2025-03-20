const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const moment = require("moment");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 設定根路徑，返回 index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const DATA_FILE = "auction_data.json";
const ADMIN_USERNAME = "111a";
const ADMIN_PASSWORD = "111b";

// 讀取競標數據
function loadAuctions() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE);
            return JSON.parse(data);
        } catch (error) {
            console.error("讀取競標數據錯誤:", error);
        }
    }
    return {};
}

// 儲存競標數據
function saveAuctions() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(auctions, null, 2));
}

let auctions = loadAuctions();

// 重新開啟已結束的競標
Object.keys(auctions).forEach((item) => {
    if (auctions[item].status === "已結束") {
        console.log(`🔄 重新開啟競標: ${item}`);
        auctions[item].status = "進行中";
        auctions[item].amount = auctions[item].startingPrice || 0;
        auctions[item].user = "None";
        auctions[item].endTime = moment().add(24, "hours").toISOString();
    }
});

saveAuctions();

wss.on("connection", (ws) => {
    console.log("🟢 新用戶連接");
    ws.send(JSON.stringify(auctions));

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            // 處理競標
            if (data.type === "bid") {
                const { item, amount, user } = data;
                if (
                    auctions[item] &&
                    auctions[item].status === "進行中" &&
                    amount > auctions[item].amount
                ) {
                    auctions[item].amount = amount;
                    auctions[item].user = user;
                    console.log(
                        `🔍 競標: ${item}, 金額: ${amount}, 競標者: ${user}`
                    );
                    saveAuctions();
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(auctions));
                        }
                    });
                } else {
                    console.log(`❌ 競標失敗: ${item} 已結束 或 金額過低`);
                }
            } 

            // 處理新增競標物品
            else if (data.type === "addItem") {
                const { adminUser, adminPass, itemName, owner, startingPrice } =
                    data;

                // 驗證管理員帳號密碼
                if (
                    adminUser === ADMIN_USERNAME &&
                    adminPass === ADMIN_PASSWORD
                ) {
                    auctions[itemName] = {
                        owner,
                        amount: startingPrice,
                        user: "None",
                        status: "進行中",
                        startingPrice,
                        timeLeft: 3600,
                        endTime: moment().add(24, "hours").toISOString(),
                    };

                    console.log(`✅ 新競標項目: ${itemName}`);
                    saveAuctions();

                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(auctions));
                        }
                    });
                } else {
                    console.log(`❌ 管理員登入失敗`);
                    ws.send(
                        JSON.stringify({
                            type: "error",
                            message: "管理員帳號或密碼錯誤",
                        })
                    );
                }
            }

        } catch (error) {
            console.error("處理訊息錯誤:", error);
        }
    });
});

server.listen(3000, () => {
    console.log("🎧 伺服器正在運行，連接至 http://localhost:3000");
});
