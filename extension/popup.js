const API_KEY = "";

document.addEventListener("DOMContentLoaded", function () {
  const scrapeBtn = document.getElementById("scrapeBtn");
  const clearBtn = document.getElementById("clearBtn");
  const status = document.getElementById("status");
  const dataContainer = document.getElementById("dataContainer");
  const dataList = document.getElementById("dataList");

  // Load saved data on popup open
  loadSavedData();

  scrapeBtn.addEventListener("click", scrapeCurrentPage);
  clearBtn.addEventListener("click", clearSavedData);

  async function scrapeCurrentPage() {
    status.textContent = "Scraping data...";
    dataContainer.style.display = "none";

    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // Execute script to get all frames data
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        function: scrapeFrameData,
      });

      let scrapedData = results
        .map((result) => result.result)
        .filter((data) => data);

      // Fetch data from local storage (collected by content script)
      const storageData = await chrome.storage.local.get(["iframeData"]);
      if (storageData.iframeData) {
        scrapedData.push(...storageData.iframeData);
      }

      const uniqueTitles = new Set();
      const uniqueData = storageData.iframeData.filter((item) => {
        if (!uniqueTitles.has(item.title)) {
          uniqueTitles.add(item.title);
          return true;
        }
        return false;
      });

      scrapedData = uniqueData;

      if (scrapedData.length > 0) {
        // Save data to storage
        await saveScrapedData(scrapedData);

        displayData(scrapedData);
        status.textContent = `Found ${scrapedData.length} frame(s)`;
      } else {
        status.textContent = "No data found";
      }
    } catch (error) {
      status.textContent = "Error: " + error.message;
    }
  }

  async function saveScrapedData(data) {
    const timestamp = new Date().toISOString();
    const savedData = {
      timestamp: timestamp,
      data: data,
    };

    await chrome.storage.local.set({ lastScrapedData: savedData });
  }

  async function loadSavedData() {
    try {
      const result = await chrome.storage.local.get(["lastScrapedData"]);

      if (result.lastScrapedData) {
        displayData(result.lastScrapedData.data);
        status.textContent = `Loaded data from ${new Date(
          result.lastScrapedData.timestamp
        ).toLocaleString()}`;
      } else {
        status.textContent = "No saved data found";
        dataContainer.style.display = "none";
      }
    } catch (error) {
      status.textContent = "Error loading saved data";
    }
  }

  async function clearSavedData() {
    try {
      // Clear all relevant keys in chrome.storage.local
      await chrome.storage.local.set({ iframeData: [], lastScrapedData: null });

      // Verify the data is cleared (optional, for debugging)
      const result = await chrome.storage.local.get([
        "iframeData",
        "lastScrapedData",
      ]);
      console.log("After clearing storage:", result);

      // Update the UI to reflect the change
      dataList.innerHTML = ""; // Clear the displayed data
      dataContainer.style.display = "none"; // Hide the data container
      status.textContent = "Saved data cleared";
    } catch (error) {
      console.error("Error clearing saved data:", error);
      status.textContent = "Error clearing data";
    }
  }

  function displayData(data) {
    dataList.innerHTML = "";

    data.forEach((frameData, index) => {
      const frameDiv = document.createElement("div");
      frameDiv.className = `iframe-item ${
        frameData.isMainFrame ? "main-frame" : ""
      }`;

      frameDiv.innerHTML = `
          <div class="title">${
            frameData.isMainFrame ? "Main Frame" : "Iframe"
          }: ${frameData.title || "Untitled"}</div>
          <div class="url">${frameData.url}</div>
          <div class="content">${frameData.text || "No content"}</div>
          <div class="timestamp">Scraped: ${new Date(
            frameData.timestamp
          ).toLocaleString()}</div>
          <button class="process-btn" data-index="${index}">Process with OpenAI</button>
          <div class="openai-result" id="openai-result-${index}" style="display: none;">
            <div class="loader" id="loader-${index}" style="display: none;">Processing...</div>
            <div class="json-viewer" id="json-viewer-${index}"></div>
          </div>
        `;

      dataList.appendChild(frameDiv);
    });

    // Add event listeners to the "Process with OpenAI" buttons
    const processButtons = document.querySelectorAll(".process-btn");
    processButtons.forEach((button) => {
      button.addEventListener("click", async (event) => {
        const index = event.target.getAttribute("data-index");
        const frameData = data[index];
        const resultDiv = document.getElementById(`openai-result-${index}`);
        const loader = document.getElementById(`loader-${index}`);
        const jsonViewer = document.getElementById(`json-viewer-${index}`);

        // Show the loader
        loader.style.display = "block";
        resultDiv.style.display = "block";
        jsonViewer.innerHTML = ""; // Clear previous result

        try {
          // Call OpenAI to process the text
          const openaiResult = await callOpenAI(frameData.text);

          // Hide the loader and display the JSON result
          loader.style.display = "none";
          renderJsonViewer(jsonViewer, openaiResult);
        } catch (error) {
          // Hide the loader and display the error
          loader.style.display = "none";
          jsonViewer.innerHTML = `<div class="error">Error processing data: ${error.message}</div>`;
        }
      });
    });

    dataContainer.style.display = "block";
  }

  // Function to render JSON in a collapsible tree structure
  function renderJsonViewer(container, data) {
    const jsonViewer = document.createElement("div");
    jsonViewer.className = "json-viewer";

    const renderJson = (obj, parent) => {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const item = document.createElement("div");
          item.className = "json-item";

          const keySpan = document.createElement("span");
          keySpan.className = "json-key";
          keySpan.textContent = key + ": ";
          item.appendChild(keySpan);

          if (typeof obj[key] === "object" && obj[key] !== null) {
            const toggle = document.createElement("span");
            toggle.className = "json-toggle";
            toggle.textContent = "[+]";
            toggle.onclick = () => {
              const content = item.querySelector(".json-content");
              if (content.style.display === "none") {
                content.style.display = "block";
                toggle.textContent = "[-]";
              } else {
                content.style.display = "none";
                toggle.textContent = "[+]";
              }
            };
            item.appendChild(toggle);

            const content = document.createElement("div");
            content.className = "json-content";
            content.style.display = "none";
            renderJson(obj[key], content);
            item.appendChild(content);
          } else {
            const valueSpan = document.createElement("span");
            valueSpan.className = "json-value";
            valueSpan.textContent = JSON.stringify(obj[key]);
            item.appendChild(valueSpan);
          }

          parent.appendChild(item);
        }
      }
    };

    renderJson(data, jsonViewer);
    container.appendChild(jsonViewer);
  }

  // Function to call OpenAI API
  async function callOpenAI(text) {
    const prompt = `Extract the main text content from the following text in a structured and sensible JSON format. Focus on the meaningful content and ignore boilerplate text like navigation, ads, and footers. Return the result as a JSON object with the following fields: "title", "summary", "keyPoints", and "fullText".
    
      Text:
      ${text}`;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`, // Replace with your OpenAI API key
          },
          body: JSON.stringify({
            model: "gpt-4o", // Use GPT-4o model
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
            max_tokens: 1000, // Adjust based on your needs
            temperature: 0.7, // Adjust for creativity vs. accuracy
          }),
        }
      );

      const data = await response.json();
      console.log({ data });

      let extractedText = "";
      try {
        const match = data.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (match) {
          extractedText = JSON.parse(match[0]);
        } else {
          extractedText = { text: data.choices[0].message.content };
        }
      } catch (e) {
        extractedText = { text: data.choices[0].message.content };
      }
      return extractedText;
    } catch (error) {
      console.error("Error calling OpenAI API:", error);
      throw error; // Propagate the error to the caller
    }
  }
});

// Function that will be injected into all frames
function scrapeFrameData() {
  return {
    id: crypto.randomUUID(),
    url: window.location.href,
    title: document.title || window.location.href,
    text: document.body ? document.body.innerText : "No content",
    timestamp: new Date().toISOString(),
    isMainFrame: window === window.top,
    frameCount: window.frames.length,
  };
}
