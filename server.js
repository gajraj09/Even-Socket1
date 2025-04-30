
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const Trend = require("./models/Trend");

const app = express();
const cors = require("cors");
app.use(cors());
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, "public")));

const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

// -----------------------
// State Variables
// -----------------------
let state = {
  live: "0",
  trend10m: "",
  trend1m: "",
  prices: {
    prev10m: "0",
    curr10m: "",
    prev1m: "0",
    curr1m: "0",
  },
  clocks: {
    clock10m: 0,
    clock1m: 0,
  },
  time: {
    minute: 0,
    second: 0,
  },
};

// -----------------------
// Utility Functions
// -----------------------

function updateTime() {
  const now = new Date();
  state.time.minute = now.getMinutes();
  state.time.second = now.getSeconds();
}

let trendString10m = "";
let trendString1m = "";

async function fetchLatestTrends() {
  try {
    const date = new Date().toISOString().split("T")[0];
    const trendEntry = await Trend.findOne({ date });
    if (trendEntry) {
      trendString10m = trendEntry.trend || "";
      trendString1m = trendEntry.trend2 || "";
      // console.log("Trend 10m:", trendString10m);
      // console.log("Trend 1m:", trendString1m);
    } else {
      console.log("No trends found for today.");
      trendString10m = "";
      trendString1m = "";
    }
  } catch (error) {
    console.error("Error fetching latest trends:", error);
    trendString10m = "";
    trendString1m = "";
  }
}

async function saveTrendToDB({ trendType, value }) {
  const date = new Date().toISOString().split("T")[0];
  try {
    let trendEntry = await Trend.findOne({ date });

    if (trendEntry) {
      trendEntry[trendType] = value;
    } else {
      trendEntry = new Trend({ date, [trendType]: value });
    }

    await trendEntry.save();
    await fetchLatestTrends();
  } catch (error) {
    console.error(`Error saving ${trendType} to DB:`, error);
  }
}

// -----------------------
// WebSocket Connections
// -----------------------

function connectWebSocket(url, onMessage) {
  const ws = new WebSocket(url);

  ws.on("open", () => console.log(`Connected to ${url}`));
  ws.on("message", onMessage);
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    setTimeout(() => connectWebSocket(url, onMessage), 5000);
  });
  ws.on("close", () => {
    console.warn("WebSocket closed. Reconnecting...");
    setTimeout(() => connectWebSocket(url, onMessage), 5000);
  });

  return ws;
}

// -----------------------
// Binance WebSocket Handlers
// -----------------------

// Live price
connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade", (event) => {
  try {
    const data = JSON.parse(event);
    state.live = parseFloat(data.p).toFixed(2);
  } catch (error) {
    console.error("Error parsing live trade data:", error);
  }
});

// 1-minute kline handler (odd trend)
connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_1m", async (event) => {
  try {
    const data = JSON.parse(event);
    const open = parseFloat(data.k.o).toFixed(2);
    const { minute, second } = state.time;

    if (minute % 10 === 0 && second > 2 && state.clocks.clock1m === 0) {
        state.clocks.clock1m = 1;
      state.prices.prev1m = open;
    //   console.log("1m Prev:", open);
    }

    if (minute % 10 === 1 && second > 2 && state.clocks.clock1m === 1) {
      state.clocks.clock1m = 2;
      state.prices.curr1m = open;

      if (state.prices.curr1m !== state.prices.prev1m) {
        const direction = state.prices.curr1m > state.prices.prev1m ? "H" : "L";
        state.trend1m += direction;

        // console.log("1m Curr:", open, "→", direction);
        await saveTrendToDB({ trendType: "trend2", value: state.trend1m });
      }
    }

    if (minute % 10 === 2 && second > 5) {
      state.clocks.clock1m = 0;
    }
  } catch (error) {
    console.error("Error handling 1m kline:", error);
  }
});

// 5-minute kline handler (even trend)
connectWebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_5m", async (event) => {
  try {
    const data = JSON.parse(event);
    const open = parseFloat(data.k.o).toFixed(2);
    const { minute, second } = state.time;

    if (state.prices.prev10m === "0") {
      state.prices.prev10m = open;
      // console.log("5m Init:", open);
    }

    if (minute % 10 === 0 && second > 2 && state.clocks.clock10m === 0) {
      state.clocks.clock10m = 1;
      state.prices.curr10m = open;

      if (state.prices.curr10m !== state.prices.prev10m) {
        const direction = state.prices.curr10m > state.prices.prev10m ? "H" : "L";
        state.trend10m += direction;
        state.prices.prev10m = state.prices.curr10m;

        // console.log("5m Curr:", open, "→", direction);
        await saveTrendToDB({ trendType: "trend", value: state.trend10m });
      }
    }

    if (minute % 10 === 1 && second > 5) {
      state.clocks.clock10m = 0;
    }
  } catch (error) {
    console.error("Error handling 5m kline:", error);
  }
});

app.get('/callback-from-server2', (req, res) => {
    // console.log('Received a call from Server 2');
    res.send('Hello from Server 1!');
});

const callServer2 = () => {
    setInterval(async () => {
        try {
            const response = await axios.get('https://odd-reviver.onrender.com/callback-from-server1');
            // console.log(`Response from Server 2: ${response.data}`);
        } catch (error) {
            console.error('Error calling Server 2:', error.message);
        }
    }, 600000); // 60000 milliseconds = 1 minute
};

// Start the timer to update time and manage the start condition
app.get("/", (req, res) => {
    res.send(`Server is Live Now`); // Send a response to the client
});

// Start the timer to update time and manage the start condition
app.get("/", (req, res) => {
    res.send(`Server is Live Now`); // Send a response to the client
});

// -----------------------
// Routes
// -----------------------
app.get("/price", (req, res) => {
  res.json({
    live: state.live,
    previous_price: state.prices.prev10m,
    current_price: state.prices.curr10m,
    trend10min: trendString10m,
    trend1min: trendString1m,
  });
});

// -----------------------
// Server Start
// -----------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  setInterval(updateTime, 1000);
  callServer2();
  console.log(`Server running on port ${PORT}`);
});
