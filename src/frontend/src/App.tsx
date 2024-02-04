import axios from "axios"
import { For, createSignal } from "solid-js"
import { encode } from 'gpt-tokenizer'
import { makePersisted } from "@solid-primitives/storage"
import { sample1, sample2, samplePrompt } from "./components"
import { Header } from "./components/Header"
import { Information } from "./components/Information"

const SplittingMethod = {
  SK: "SK",
  SKTIKTOKEN: "SKTiktoken",
  Paragraph: "Paragraph",
  ParagraphWords: "ParagraphWords"
}

const DefaultSettings: ISettings = {
  maxTokensPerLine: "512",
  maxTokensPerParagraph: "512",
  overlapTokens: "0",
  wordCount: "512",
  method: SplittingMethod.SKTIKTOKEN,
  chunks: "3",
  relevance: "0.7",
  prompt: "",
  max_tokens: "1024",
  temperature: "0.3",
  url: ""
}

const BASE_URI = "http://localhost:5096/"
const URI_CHUNK = BASE_URI + "api/v1/content/split"
const URI_LOAD = BASE_URI + "api/v1/content/load"
//const URI_COMPLETION = BASE_URI + "api/v1/content/completion"
const URI_RAG_QUERY = BASE_URI + "api/v1/rag/query"
const URI_RAG_RESET_USER = BASE_URI + "api/v1/rag/reset/{userId}"


function App() {
  const [settings, setSettings] = makePersisted(createSignal<ISettings>(DefaultSettings))
  const [text, setFile1Text] = makePersisted(createSignal(''))
  const [text2, setFile2Text] = makePersisted(createSignal(''))
  const [file1Tokens, setFile1Tokens] = createSignal(0)
  const [file2Tokens, setFile2Tokens] = createSignal(0)
  const [tokensContext, setTokensContext] = createSignal(0)
  const [tokensPrompt, setTokensPrompt] = createSignal(0)
  const [tokensCompletion, setTokensCompletion] = createSignal(0)
  const [allMemories, setAllMemories] = createSignal<IMemoryChunkInfo[]>([])
  const [usedMemories, setUsedMemories] = createSignal<IMemoryChunkInfo[]>([])
  const [context, setContext] = createSignal('')
  const [completion, setCompletion] = createSignal('')
  const [processing, setProcessing] = createSignal(false)
  const [promptButtonLabel, setPromptButtonLabel] = createSignal("Process")
  //const [useContext, _] = createSignal(true)
  const [tab, setTab] = createSignal('chunk')
  const [userId, setUserId] = makePersisted(createSignal(uuidv4()))

  function uuidv4() {
    let userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
      .replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0,
          v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    userId = userId.replace(/-/g, '')
    return "user_" + userId.substring(userId.length - 12)
  }

  const getTokenCountAfterTyping = (value: string, control: string) => {
    if (control === "chunk") {
      setFile1Text(value)
      setFile1Tokens((encode(value)).length);
      setFile2Tokens((encode(text2())).length);
    }
    if (control === "chunk2") {
      setFile2Text(value)
      setFile1Tokens((encode(text())).length);
      setFile2Tokens((encode(value)).length);
    }
    if (control === "context") {
      setContext(value)
      setTokensContext(encode(value).length);
    }
    if (control === "prompt") {
      setSettings({ ...settings(), prompt: value })
      setTokensPrompt((encode(value + context())).length);
    }
  }

  const UpdateTokenCounts = () => {
    setFile1Tokens((encode(text())).length);
    setFile2Tokens((encode(text2())).length);
    setTokensPrompt((encode(settings().prompt + context())).length);
    setTokensContext(encode(context()).length);
    setTokensCompletion(encode(completion()).length);
  }

  const LoadContext = () => {
    const totalChunks = parseInt(settings().chunks)
    const chunks = allMemories()
    if (totalChunks > 0 && allMemories().length > 0) {
      let chunkText = ""
      for (let i = 0; i < totalChunks; i++) {
        if (i == chunks.length) break;
        chunkText += chunks[i].text + "\n\n"
      }
      setContext(chunkText)
      UpdateTokenCounts()
    }
  }

  const ProcessChunks = async () => {
    if (processing()) return
    setProcessing(true)
    setAllMemories([])
    setUsedMemories([])
    getTokenCountAfterTyping(text(), "chunk")
    const maxTokensPerParagraph = settings().method == SplittingMethod.Paragraph ? parseInt(settings().wordCount) : parseInt(settings().maxTokensPerLine)
    const payload = {
      userName: userId(),
      files: [
        {
          fileName: "file1",
          content: text()
        },
        {
          fileName: "file2",
          content: text2()
        }
      ],
      maxTokensPerLine: parseInt(settings().maxTokensPerLine),
      maxTokensPerParagraph,
      overlapTokens: parseInt(settings().overlapTokens),
      method: settings().method
    }
    try {
      const resp = await axios.post<IMemoryChunkInfo[]>(URI_CHUNK, payload)
      const data = resp.data
      console.info(data)
      setAllMemories(data)
      //LoadContext()
      UpdateTokenCounts()
      setTab("prompt")
    } catch (err) {
      console.error(err)
    } finally {
      setProcessing(false)
    }
  }

  const LoadAndProcess = async () => {
    if (processing()) return
    setFile1Text(sample1)
    setFile2Text(sample2)
    await ProcessChunks()
  }

  const LoadSamplePrompt = () => {
    setSettings({ ...settings(), prompt: samplePrompt })
    UpdateTokenCounts()
  }

  const LoadFile = async () => {
    if (processing()) return
    setProcessing(true)
    const payload = { url: settings().url }
    setSettings({ ...settings(), url: "Loading ..." })
    try {
      const resp = await axios.post(URI_LOAD, payload)
      const content = resp.data.content;
      setFile1Text(content)
      UpdateTokenCounts()
    } catch (err) {
      console.error(err)
    } finally {
      setSettings({ ...settings(), url: "" })
      setProcessing(false)
    }
  }

  const ProcessPrompt = async () => {
    if (processing()) return
    // Use a template form    
    const payload = {
      collection: userId(),
      prompt: settings().prompt,
      limit: settings().chunks,
      relevance: settings().relevance,
      max_tokens: parseInt(settings().max_tokens),
      temperature: parseFloat(settings().temperature)
    }
    //console.info(`Submit: ${JSON.stringify(payload)}`)
    setProcessing(true)
    try {
      setPromptButtonLabel("Busy...")
      const resp = await axios.post<IQueryResponse>(URI_RAG_QUERY, payload)
      const data = resp.data
      console.info(`Completion: ${JSON.stringify(data)}`)
      setContext(data.context)
      setCompletion(data.completion)
      setUsedMemories(data.memories)
      setTab("completion")
      UpdateTokenCounts()
    } catch (err) {
      console.error(err)
    } finally {
      setProcessing(false)
      setPromptButtonLabel("Submit")
    }
  }

  const Reset = async () => {
    try {
      if (userId())
        await axios.delete(URI_RAG_RESET_USER.replace("{userId}", userId()))
    } catch (err) {
      console.error(err)
    }
    setSettings(DefaultSettings)
    setFile1Text('')
    setFile2Text('')
    setFile1Tokens(0)
    setFile2Tokens(0)
    setTokensContext(0)
    setTokensPrompt(0)
    setTokensCompletion(0)
    setAllMemories([])
    setUsedMemories([])
    setContext('')
    setCompletion('')
    setProcessing(false)
    setPromptButtonLabel("Process")
    setUserId(uuidv4())
    setTab("chunk")
  }

  return (
    <>
      <Header />
      <nav class="flex flex-row flex-wrap space-x-2 p-2 bg-blue-800 text-white hidden">
        <div class="space-x-2 space-y-2">
          <label>Document URL:</label>
          <input
            value={settings().url}
            onInput={(e) => setSettings({ ...settings(), url: e.currentTarget.value })}
            class="px-1 md:w-[500px] w-[90%] text-black" type="text" />
          <button
            onClick={LoadFile}
            class="p-2 bg-green-800 hover:bg-green-700 font-semibold rounded">Load</button>
        </div>
      </nav>

      <div class="px-3 mt-3 h-[43px]">
        <nav class="flex flex-row w-full flex-wrap space-x-[2px]">
          <button
            onClick={() => setTab("chunk")}
            class={`p-2 hover:underline hover:text-black ${tab() == "chunk" ? "border-black border-2 underline text-black" : "border"} font-semibold`}>Text&nbsp;
            <span title="Total Tokens" class='px-2 bg-blue-900 text-white rounded-xl'>{file1Tokens() + file2Tokens()}</span>
          </button>
          <button
            onClick={() => setTab("prompt")}
            class={`p-2 hover:underline hover:text-black ${tab() == "prompt" ? "border-black border-2 underline text-black" : "border"} font-semibold`}>Prompt&nbsp;
            <span title="Total Tokens" class='px-2 bg-blue-900 text-white rounded-xl'>{tokensPrompt()}</span>
          </button>
          <button
            onClick={() => setTab("context")}
            class={`p-2 hover:underline hover:text-black ${tab() == "context" ? "border-black border-2 underline text-black" : "border"} font-semibold`}>Context&nbsp;
            <span title="Total Tokens" class='px-2 bg-blue-900 text-white rounded-xl'>{tokensContext()}</span>
          </button>
          <button
            onClick={() => setTab("completion")}
            class={`p-2 hover:underline hover:text-black ${tab() == "completion" ? "border-black border-2 underline text-black" : "border"} font-semibold`}>Completion&nbsp;
            <span title="Total Tokens" class='px-2 bg-blue-900 text-white rounded-xl'>{tokensCompletion()}</span>
          </button>
        </nav>
      </div>
      <div class="px-3 flex flex-row flex-wrap w-full h-[calc(100vh-135px)] overflow-auto">
        <div class="w-full md:w-1/2">
          {/* Input Text */}
          <section hidden={tab() !== "chunk"}>
            <div class="flex flex-row flex-wrap space-x-2 p-2 bg-blue-900 text-white">
              <label>Method:</label>
              <div class="space-x-2">
                <input type='radio' name="method"
                  checked={settings().method === SplittingMethod.SKTIKTOKEN}
                  onInput={(e) => setSettings({ ...settings(), method: e.currentTarget.value })}
                  value={SplittingMethod.SKTIKTOKEN} />
                <label>Tokens</label>
              </div>
              <div class="space-x-2">
                <input type='radio' name="method"
                  checked={settings().method === SplittingMethod.SK}
                  onInput={(e) => setSettings({ ...settings(), method: e.currentTarget.value })}
                  value={SplittingMethod.SK} />
                <label>SK Counter</label>
              </div>
              <div class="space-x-2">
                <input type='radio' name="method"
                  checked={settings().method === SplittingMethod.Paragraph}
                  onInput={(e) => setSettings({ ...settings(), method: e.currentTarget.value })}
                  value={SplittingMethod.Paragraph} />
                <label>Paragraphs</label>
              </div>
              <div class="space-x-2">
                <input type='radio' name="method"
                  checked={settings().method === SplittingMethod.ParagraphWords}
                  onInput={(e) => setSettings({ ...settings(), method: e.currentTarget.value })}
                  value={SplittingMethod.ParagraphWords} />
                <label>Paragraph/Words</label>
              </div>
            </div>
            <div class="flex flex-row flex-wrap space-x-2 p-2 bg-blue-900 text-white">
              <div class={"space-x-2"} hidden={settings().method == SplittingMethod.Paragraph || settings().method == SplittingMethod.ParagraphWords}>
                <label>Tokens/Line:</label>
                <input
                  value={settings().maxTokensPerLine}
                  onInput={(e) => setSettings({ ...settings(), maxTokensPerLine: e.currentTarget.value })}
                  class="w-20 px-1 text-black" type="text" />
              </div>
              <div class="space-x-2" hidden={settings().method == SplittingMethod.Paragraph || settings().method == SplittingMethod.ParagraphWords}>
                <label>Tokens/Paragraph:</label>
                <input
                  value={settings().maxTokensPerParagraph}
                  onInput={(e) => setSettings({ ...settings(), maxTokensPerParagraph: e.currentTarget.value })}
                  class="w-20 px-1 text-black" type="text" />
              </div>
              <div class="space-x-2" hidden={settings().method == SplittingMethod.Paragraph || settings().method == SplittingMethod.ParagraphWords}>
                <label>Overlap Tokens:</label>
                <input
                  value={settings().overlapTokens}
                  onInput={(e) => setSettings({ ...settings(), overlapTokens: e.currentTarget.value })}
                  class="w-20 px-1 text-black" type="text" />
              </div>
              <div class="space-x-2" hidden={settings().method == SplittingMethod.Paragraph || settings().method == SplittingMethod.SK || settings().method == SplittingMethod.SKTIKTOKEN}>
                <label>Word Count:</label>
                <input
                  value={settings().wordCount}
                  onInput={(e) => setSettings({ ...settings(), wordCount: e.currentTarget.value })}
                  class="w-20 px-1 text-black" type="text" />
              </div>
            </div>
            <div class="flex flex-col bg-white space-y-2 p-2">
              <div class="flex flex-row flex-wrap">
                <div class="flex flex-col w-1/2 p-1">
                  <label class='font-bold uppercase'>File 1: <span class="font-bold bg-blue-800 rounded-xl text-white p-1">{file1Tokens()}</span></label>
                  <textarea
                    class="border border-black p-2 round-lg"
                    value={text()}
                    onInput={(e) => { getTokenCountAfterTyping(e.currentTarget.value, "chunk") }}
                    rows={25}>
                  </textarea>
                </div>
                <div class="flex flex-col w-1/2 p-1">
                  <label class='font-bold uppercase'>File 2: <span class="font-bold bg-blue-800 rounded-xl text-white p-1">{file2Tokens()}</span></label>
                  <textarea
                    value={text2()}
                    onInput={(e) => { getTokenCountAfterTyping(e.currentTarget.value, "chunk2") }}
                    class="border border-black p-2 round-lg w-full"
                    rows={25}>
                  </textarea>
                </div>
              </div>
              <div class="space-x-2">
                <button
                  onClick={ProcessChunks}
                  class="w-24 p-2 bg-blue-900 hover:bg-blue-900 text-white font-semibold">Embed</button>
                <button
                  onClick={LoadAndProcess}
                  class="p-2 bg-green-800 hover:bg-green-700 text-white font-semibold">Load Samples & Embed</button>
              </div>
              <Information />
            </div>
          </section>
          <section hidden={tab() !== "context"}>
            <div class="flex flex-col space-y-2 mt-2 p-2">
              <textarea
                class="border border-black p-2 round-lg bg-slate-200"
                readOnly
                value={context()}
                onInput={(e) => getTokenCountAfterTyping(e.currentTarget.value, "context")}
                rows={20}>
              </textarea>
              <button class="p-2 w-24 bg-blue-900 text-white"
                onclick={LoadContext}
              >Load</button>
            </div>
          </section>
          <section hidden={tab() !== "prompt"}>
            <div>
              <div class="bg-blue-900 p-1 text-white space-x-1">
                <label class='uppercase'>Max Tokens:</label>
                <input class="w-20 px-1 text-black"
                  value={settings().max_tokens}
                  oninput={(e) => setSettings({ ...settings(), max_tokens: e.currentTarget.value })}
                />
                <label class='uppercase'>Temperature:</label>
                <input class="w-20 px-1 text-black"
                  value={settings().temperature}
                  oninput={(e) => setSettings({ ...settings(), temperature: e.currentTarget.value })}
                />
                <label class='uppercase'>Limit:</label>
                <input class="w-20 px-1 text-black"
                  value={settings().chunks}
                  oninput={(e) => setSettings({ ...settings(), chunks: e.currentTarget.value })}
                />
                <label class='uppercase'>Relevance:</label>
                <input class="w-20 px-1 text-black"
                  value={settings().relevance}
                  oninput={(e) => setSettings({ ...settings(), relevance: e.currentTarget.value })}
                />
              </div>
            </div>
            <div class="flex flex-col space-y-2 mt-2 p-2">
              <textarea
                class="border border-black p-2 round-lg"
                value={settings().prompt}
                onInput={(e) => getTokenCountAfterTyping(e.currentTarget.value, "prompt")}
                rows={20}>
              </textarea>
              <div class="p-2 bg-yellow-100">
                <p><strong>Note: </strong>the additional context will be added automatically at the end of the Prompt. If you need to set a specific placement, use the &lt;CONTEXT&gt; placeholder. This placeholder will be replaced in the final Prompt at the specific location.</p>
              </div>
              <div class="space-x-2">
                <button class="p-2 w-24 bg-blue-900 hover:bg-blue-700 text-white font-semibold"
                  onclick={ProcessPrompt}
                >{promptButtonLabel()}
                </button>
                <button class="p-2 bg-green-800 hover:bg-green-700 text-white font-semibold"
                  onclick={LoadSamplePrompt}
                >Sample Prompt
                </button>
              </div>
            </div>
          </section>
          <section hidden={tab() !== "completion"}>
            <div class="flex flex-col mt-2 space-y-2 p-2">
              <textarea
                readOnly
                value={completion()}
                class="border bg-slate-200 border-black p-2 round-lg"
                rows={20}>
              </textarea>
            </div>
          </section>
          <section class="w-full md:w-1/4 px-2 space-y-2">

          </section>
        </div>
        <div class="w-full md:w-1/4 px-2 bg-blue-100">
          <div class="space-x-2 bg-blue-900 text-white p-1">
            <label class="uppercase text-sm">All Embeddings: </label> <span title="Total Chunks" class='px-2 bg-slate-800 text-white rounded-xl'>{allMemories().length}</span> -
            <span title="Total Tokens" class='px-2 bg-slate-800 text-white rounded-xl'>{allMemories().reduce((acc, chunk) => acc + chunk.tokenCount, 0)}</span>
          </div>
          <div class="overflow-auto">
            <For each={allMemories()}>
              {(chunk) => (
                <div class="flex flex-col mb-2 rounded-lg p-2 space-y-3 border-2 border-slate-300 hover:border-2 hover:border-slate-800 shadow">
                  <div>
                    <span class="text-sm font-bold uppercase">Embedding: </span>{chunk.chunkId} <span class="text-sm font-bold uppercase">Tokens: </span>{chunk.tokenCount}
                  </div>
                  <hr class="border-black" />
                  {/* <span class="">{chunk.text}</span> */}
                  <textarea class="bg-slate-200 p-2" rows={10} value={chunk.text} readOnly></textarea>
                  <textarea class="bg-yellow-200 p-2" rows={2} value={chunk.embedding} readOnly></textarea>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="w-full md:w-1/4 px-2 bg-green-100">
          <div class="space-x-2 bg-green-800 text-white p-1">
            <label class="uppercase text-sm">Used Embeddings: </label> <span title="Total Chunks" class='px-2 bg-slate-800 text-white rounded-xl'>{usedMemories().length}</span> -
            <span title="Total Tokens" class='px-2 bg-slate-800 text-white rounded-xl'>{usedMemories().reduce((acc, chunk) => acc + chunk.tokenCount, 0)}</span>
          </div>
          <div class="overflow-auto">
            <For each={usedMemories()}>
              {(chunk) => (
                <div class="flex flex-col mb-2 rounded-lg p-2 space-y-3 border-2 border-slate-300 hover:border-2 hover:border-slate-800 shadow">
                  <div>
                    <span class="text-sm font-bold uppercase">Embedding: </span>{chunk.chunkId} <span class="text-sm font-bold uppercase">Tokens: </span>{chunk.tokenCount}
                  </div>
                  <hr class="border-black" />
                  {/* <span class="">{chunk.text}</span> */}
                  <textarea class="bg-slate-200 p-2" rows={10} value={chunk.text} readOnly></textarea>
                  <textarea class="bg-yellow-200 p-2" rows={2} value={chunk.embedding} readOnly></textarea>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
      <section class={"flex h-[35px] space-x-2 items-center px-2 " + (processing() ? "bg-red-600" : "bg-slate-800")}>
        <label class="text-white">ID:</label>
        <input class="px-1 text-black text-sm h-[24px] bg-slate-300" readOnly type="text" value={userId()} />
        <button class="bg-red-700 text-white p-1 hover:bg-red-600 hover:text-white font-semibold rounded-md"
          onclick={Reset}
        >Reset</button>
      </section>
    </>
  )
}

export default App
