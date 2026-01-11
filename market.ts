const TARGET_ASSET =
  "82282239328474018205105491929033644496357668579127643134512317986090887443137";
const TARGET_MARKET =
  "0x1e17e60a28b3f9ddb668c5fac7b225095a5734a3825cf013659166045e94322f";

interface OrderLevel {
  price: string;
  size: string;
}

interface OrderBook {
  market: string;
  asset_id: string;
  timestamp: string;
  hash: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
  event_type: "book";
  last_trade_price: string;
}

interface PriceChange {
  asset_id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  hash: string;
  best_bid: string;
  best_ask: string;
}

interface PriceChangeEvent {
  market: string;
  price_changes: PriceChange[];
  timestamp: string;
  event_type: "price_change";
}

type PolymarketEvent = OrderBook | PriceChangeEvent;

interface GraphPoint {
  timestamp: number;
  mid: number;
  spread: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
}

//const orderBook: Map<number, number> = new Map(); // price -> cumulative size
const graphData: GraphPoint[] = [];

function processOrderBook(book: OrderBook) {
  if (book.asset_id !== TARGET_ASSET) return;

  const bids = new Map<number, number>();
  const asks = new Map<number, number>();

  // convert to maps for easier processing
  book.bids.forEach((level) => {
    bids.set(parseFloat(level.price), parseFloat(level.size));
  });

  book.asks.forEach((level) => {
    asks.set(parseFloat(level.price), parseFloat(level.size));
  });

  const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  const mid = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;

  const topBidSize = book.bids.length > 0 ? parseFloat(book.bids[0].size) : 0;
  const topAskSize = book.asks.length > 0 ? parseFloat(book.asks[0].size) : 0;

  // console.log(
  //   `[${new Date(parseInt(book.timestamp)).toISOString()}] book update`,
  // );
  // console.log(`  raw: bid=${bestBid} ask=${bestAsk} => mid=${mid.toFixed(4)}`);
  // console.log(`  spread: $${spread.toFixed(4)}`);
  // console.log(`  best bid: $${bestBid} (${topBidSize})`);
  // console.log(`  best ask: $${bestAsk} (${topAskSize})`);
  // console.log(`  last trade: $${book.last_trade_price}`);

  // filter out unreasonably wide spreads (> 50%)
  if (spread > 0.499) {
    //console.log(`  skipping: spread too wide (${(spread * 100).toFixed(1)}%)`);
    return;
  }

  const point: GraphPoint = {
    timestamp: parseInt(book.timestamp),
    mid,
    spread,
    bid: bestBid,
    ask: bestAsk,
    bidSize: topBidSize,
    askSize: topAskSize,
  };

  graphData.push(point);
}

function processPriceChange(event: PriceChangeEvent) {
  const change = event.price_changes.find((pc) => pc.asset_id === TARGET_ASSET);
  if (!change) return;

  const mid = (parseFloat(change.best_bid) + parseFloat(change.best_ask)) / 2;
  const spread = parseFloat(change.best_ask) - parseFloat(change.best_bid);

  const point: GraphPoint = {
    timestamp: parseInt(event.timestamp),
    mid,
    spread,
    bid: parseFloat(change.best_bid),
    ask: parseFloat(change.best_ask),
    bidSize: parseFloat(change.size),
    askSize: parseFloat(change.size),
  };

  graphData.push(point);

  // console.log(`[${new Date(parseInt(event.timestamp)).toISOString()}] trade`);
  // console.log(`  ${change.side} ${change.size} @ $${change.price}`);
  // console.log(`  best bid: $${change.best_bid}, best ask: $${change.best_ask}`);
}

function generateAsciiGraph(hoursToShow: number = 24) {
  if (graphData.length === 0) {
    console.log("no data yet");
    return;
  }

  // filter to time range
  const now = Date.now();
  const cutoffTime = now - hoursToShow * 3600 * 1000;
  const filteredData = graphData.filter((p) => p.timestamp >= cutoffTime);

  if (filteredData.length === 0) {
    console.log("no data in specified time range");
    return;
  }

  // find min/max for scaling with padding
  const mids = filteredData.map((p) => p.mid);
  const dataMin = Math.min(...mids);
  const dataMax = Math.max(...mids);
  const dataRange = dataMax - dataMin || 0.1;

  // add 10% padding on top and bottom
  const padding = dataRange * 0.1;
  const minMid = Math.max(0, dataMin - padding);
  const maxMid = Math.min(1, dataMax + padding);
  const range = maxMid - minMid;

  // use terminal dimensions - maximize screen usage
  const termHeight = Deno.consoleSize().rows;
  const termWidth = Deno.consoleSize().columns;

  const height = termHeight - 8; // minimal room for labels
  const width = termWidth - 13; // room for price labels
  const step = filteredData.length / width;

  const grid: string[][] = Array(height)
    .fill(null)
    .map(() => Array(width).fill(" "));

  // plot mid prices
  for (let i = 0; i < width; i++) {
    const dataIdx = Math.floor(i * step);
    if (dataIdx >= filteredData.length) break;

    const point = filteredData[dataIdx];
    const normalized = (point.mid - minMid) / range;
    const row = Math.floor((1 - normalized) * (height - 1));

    grid[row][i] = "●";
  }

  // current price stats - skip last point if it looks like bad data
  let latest = filteredData[filteredData.length - 1];
  if (latest.mid === 0.5 && filteredData.length > 1) {
    latest = filteredData[filteredData.length - 2];
  }

  const yesChance = (latest.mid * 100).toFixed(1);
  const noChance = ((1 - latest.mid) * 100).toFixed(1);

  // calculate total volume at current best bid/ask
  const totalBidVolume = latest.bidSize;
  const totalAskVolume = latest.askSize;
  console.log("Will X be banned in the UK by March 31?");
  console.log(
    `yes: ${yesChance}% | no: ${noChance}% | last ${hoursToShow}h | mid: $${minMid.toFixed(3)} - $${maxMid.toFixed(3)}`,
  );
  console.log(
    `${filteredData.length} data points | vol: ${totalBidVolume.toFixed(0)} bid / ${totalAskVolume.toFixed(0)} ask | spread: $${latest.spread.toFixed(4)}\n`,
  );

  for (let row = 0; row < height; row++) {
    const price = minMid + ((height - 1 - row) / (height - 1)) * range;
    const priceStr = `$${price.toFixed(3)}`;
    console.log(priceStr.padEnd(8) + "│ " + grid[row].join(""));
  }

  // time axis
  const oldestTime = new Date(filteredData[0].timestamp).toLocaleTimeString();
  const newestTime = new Date(latest.timestamp).toLocaleTimeString();
  console.log("        └" + "─".repeat(width + 1));
  console.log(
    `        ${oldestTime.padEnd(width - oldestTime.length)}${newestTime}`,
  );
}

async function backfillHistory(assetId: string, hoursBack: number = 24) {
  const now = Math.floor(Date.now() / 1000);
  const startTs = now - hoursBack * 3600;
  const url = `https://clob.polymarket.com/prices-history?startTs=${startTs}&market=${assetId}&fidelity=11`;

  console.log(`backfilling ${hoursBack}h of history...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`failed to fetch history: ${response.status}`);
      return;
    }

    const data = await response.json();
    const history = data.history as Array<{ t: number; p: number }>;

    console.log(`loaded ${history.length} historical data points`);

    // convert to graph points, assuming minimal spread for historical data
    history.forEach((point) => {
      const spread = 0.01; // estimate
      graphData.push({
        timestamp: point.t * 1000, // convert to ms
        mid: point.p,
        spread,
        bid: point.p - spread / 2,
        ask: point.p + spread / 2,
        bidSize: 0,
        askSize: 0,
      });
    });
  } catch (e) {
    console.error("error fetching history:", e);
  }
}

async function connectAndListen(wsUrl: string) {
  console.log(`connecting to ${wsUrl}...`);

  // backfill before connecting
  await backfillHistory(TARGET_ASSET, 24);

  let ws: WebSocket | null = null;
  let pingInterval: number | null = null;
  let shouldReconnect = true;

  const connect = () => {
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("connected to polymarket feed");
        // subscribe to market data
        const subscribeMsg = {
          assets_ids: [TARGET_ASSET],
          type: "market",
        };
        console.log("sending subscription:", JSON.stringify(subscribeMsg));
        ws!.send(JSON.stringify(subscribeMsg));

        // ping every 30 seconds to keep connection alive
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // handle array of events
          if (Array.isArray(data)) {
            data.forEach((item) => {
              if (item.event_type === "book") {
                processOrderBook(item as OrderBook);
              } else if (item.event_type === "price_change") {
                processPriceChange(item as PriceChangeEvent);
              }
            });
          } else {
            // handle single event
            if (data.event_type === "book") {
              processOrderBook(data as OrderBook);
            } else if (data.event_type === "price_change") {
              processPriceChange(data as PriceChangeEvent);
            }
          }
        } catch (e) {
          console.error("error parsing message:", e);
        }
      };

      ws.onerror = (error) => {
        console.error("websocket error:", error);
      };

      ws.onclose = () => {
        console.log("disconnected from feed");
        if (pingInterval) clearInterval(pingInterval);

        // reconnect after 3 seconds if we should
        if (shouldReconnect) {
          console.log("reconnecting in 3 seconds...");
          setTimeout(connect, 3000);
        }
      };
    } catch (e) {
      console.error("connection failed:", e);
      if (shouldReconnect) {
        console.log("retrying in 3 seconds...");
        setTimeout(connect, 3000);
      }
    }
  };

  try {
    connect();

    // enter alternate screen buffer mode
    console.log("\x1b[?1049h");
    console.log("\x1b[2J"); // clear screen
    console.log("\x1b[H"); // cursor to home

    //generate graph every half second
    const graphInterval = setInterval(() => {
      console.log("\x1b[2J"); // clear screen
      console.log("\x1b[H"); // cursor to home
      generateAsciiGraph();
    }, 500);

    // handle exit gracefully
    const cleanup = () => {
      shouldReconnect = false;
      if (ws) ws.close();
      if (pingInterval) clearInterval(pingInterval);
      console.log("\x1b[?1049l"); // exit alternate screen
      clearInterval(graphInterval);
      Deno.exit(0);
    };

    Deno.addSignalListener("SIGINT", cleanup);
    Deno.addSignalListener("SIGTERM", cleanup);

    // keep the script alive
    await new Promise(() => {});
  } catch (e) {
    console.error("connection failed:", e);
    console.log("\x1b[?1049l"); // exit alternate screen on error
    Deno.exit(1);
  }
}

// detect websocket url - you'll need to provide the actual polymarket websocket endpoint
const wsUrl =
  Deno.env.get("POLYMARKET_WS_URL") ||
  "wss://ws-subscriptions-clob.polymarket.com/ws/market";

console.log(`tracking asset: ${TARGET_ASSET}`);
console.log(`market: ${TARGET_MARKET}`);
console.log("");

connectAndListen(wsUrl);
