window.addEventListener('load', async () => {
    const url = new URL(window.location)
    if (url.searchParams.has('tx')) {
        document.getElementById('tx').value = url.searchParams.get('tx')
    }
    loadVideo()
})

async function loadVideo() {
    document.getElementById('status').innerHTML = `Downloading...`
    
    const masterTx = document.getElementById('tx').value
    const video = document.querySelector('video.bcat-video')
    const image = document.querySelector('img.bcat-image')
    const loadingMessage = document.querySelector('#loading-message')
    const infoBox = document.getElementById('info-box')
    const fileNameElement = document.getElementById('file-name')
    const downloadLink = document.getElementById('download')

    video.style.display = 'none'
    image.style.display = 'none'
    infoBox.style.display = 'none'
    loadingMessage.style.display = 'block'

    let mimeType
    let fileName

    const objectUrl = await bcatFile(masterTx, (type, properties) => {
        switch (type) {
            case 'info':
                mimeType = properties.mimeType
                fileName = properties.fileName
                break;
            case 'fetch':
                document.getElementById('status').innerHTML = `Downloading ${properties.segment} of ${properties.arguments} (${(properties.size / 1e6).toFixed(1)} MB) <progress value="${properties.segment}" max="${properties.arguments}"></progress>`
                break;
            case 'done':
                document.getElementById('status').innerHTML = `Download complete (${(properties.size / 1e6).toFixed(1)} MB)`
                break;
        }
    })

    loadingMessage.style.display = 'none'

    fileNameElement.innerHTML = fileName

    downloadLink.setAttribute('href', objectUrl)
    downloadLink.setAttribute('download', fileName)

    infoBox.style.display = 'block'

    if (mimeType.startsWith('video') || mimeType.startsWith('audio')) {
        video.src = objectUrl
        video.style.display = 'inline'
    } else if (mimeType.startsWith('image')) {
        image.src = objectUrl
        image.style.display = 'inline'
    }
} 

// Returns an objectUrl promise which can be assigned to video.src
// e.g. video.src = await bcat(masterTx)
// with callback:
// video.src = await bcat(masterTx, (type, properties) => {
//    if (type === 'info') console.log(properties.mimeType + ', ' + properties.fileName)
//    if (type === 'update') console.log(properties.segment + ' of ' + properties.arguments + ' ' + properties.size)
//    if (type === 'done') console.log('Done ' + properties.size)
// })
async function bcat(masterTx, cb) {
    if ('MediaSource' in window) {
        const bcatArguments = await getBCatArguments(masterTx)
        const mimeCodec = fromHex(bcatArguments[2])
        const fileName = fromHex(bcatArguments[4])
        cb('info', {mimeType: mimeCodec, fileName: fileName})
        console.log(`mime codec: ${mimeCodec}`)
        console.log(`filename: ${fileName}`)

        if (MediaSource.isTypeSupported(mimeCodec)) {
            var mediaSource = new MediaSource()
            console.log(mediaSource.readyState) // closed
            mediaSource.addEventListener('sourceopen', async () => {
                console.log(this.readyState) // open
                const sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
                let fetchList = []
                let size = 0
                for (let segment = 6; segment < bcatArguments.length; segment++) {
                    if (segment % 30 == 0) {
                        size += await waitForFetchListSourceBuffer(fetchList, sourceBuffer)
                        fetchList = []
                    }
                    const tx = bcatArguments[segment]
                    const url = 'https://bico.media/' + tx
                    //console.log(`fetching segment [${segment}] ${url}`)
                    if (cb) cb('fetch', {segment: segment, arguments: bcatArguments.length, size: size})
                    fetchList.push(fetch(url))
                }
                size += await waitForFetchListSourceBuffer(fetchList, sourceBuffer)
                if (cb) cb('done', {size: size})
                // https://github.com/samdutton/simpl/issues/92
                sourceBuffer.addEventListener('updateend', function() {
                    if (!sourceBuffer.updating && mediaSource.readyState === 'open') {
                        mediaSource.endOfStream();
                    }
                });
            });
            return URL.createObjectURL(mediaSource)
        } else {
            console.error('Unsupported MIME type or codec: ', mimeCodec);
        }
    }
}

// Returns the concatenated file contents in a Blob in an objectURL promise
async function bcatFile(masterTx, cb) {
    const bcatArguments = await getBCatArguments(masterTx)
    const mimeCodec = fromHex(bcatArguments[2])
    const fileName = fromHex(bcatArguments[4])
    cb('info', {mimeType: mimeCodec, fileName: fileName})
    console.log(`mime codec: ${mimeCodec}`)
    console.log(`filename: ${fileName}`)

    let arrayBuffers = []
    let fetchList = []
    let size = 0
    for (let segment = 6; segment < bcatArguments.length; segment++) {
        if (segment % 30 == 0) {
            size += await waitForFetchListArrayBuffers(fetchList, arrayBuffers)
            fetchList = []
        }
        const tx = bcatArguments[segment]
        const url = 'https://bico.media/' + tx
        //console.log(`fetching segment [${segment}] ${url}`)
        if (cb) cb('fetch', {segment: segment, arguments: bcatArguments.length, size: size})
        fetchList.push(fetch(url))
    }
    size += await waitForFetchListArrayBuffers(fetchList, arrayBuffers)
    if (cb) cb('done', {size: size})

    const blob = new Blob(arrayBuffers, {type: mimeCodec})

    return URL.createObjectURL(blob)
}

async function waitForFetchListSourceBuffer(fetchList, sourceBuffer) {
    let size = 0
    const responses = await Promise.all(fetchList)
    for (let i = 0; i < responses.length; i++) {
        let response = responses[i]
        const arrayBuffer = await response.arrayBuffer()
        sourceBuffer.append(arrayBuffer) 
        size += arrayBuffer.byteLength
    }
    return size
}

async function waitForFetchListArrayBuffers(fetchList, arrayBuffers) {
    let size = 0
    const responses = await Promise.all(fetchList)
    for (let i = 0; i < responses.length; i++) {
        let response = responses[i]
        const arrayBuffer = await response.arrayBuffer()
        arrayBuffers.push(arrayBuffer);    
        size += arrayBuffer.byteLength
    }
    return size
}

// Gets the BCat arguments including list of transaction ids from BitDB
async function getBCatArguments(masterTx) {
    const query = {
        "v": 3,
        "q": {
            "find": {
                "tx.h": masterTx
            },
            "project": {
                "out": 1
            }
        }
    };
    const b64 = btoa(JSON.stringify(query))
    const url = "https://genesis.bitdb.network/q/1FnauZ9aUH2Bex6JzdcV4eNX7oLSSEbxtN/" + b64
    const response = await fetch(url, { headers: { key: '1DzNX2LzKrmoyYVyqMG46LLknzSd7TUYYP' } })
    const json = await response.json()
    const items = json.u.concat(json.c)
    const output = items[0].out[0]
    const hashes = Object.keys(output).filter(key => key.startsWith("h")).map(key => output[key])
    return hashes   
}

// https://stackoverflow.com/questions/21647928/javascript-unicode-string-to-hex
function fromHex(hex){
    let str
    try {
        str = decodeURIComponent(hex.replace(/(..)/g,'%$1'))
    } catch(e) {
        str = hex
        console.log('invalid hex input: ' + hex)
    }
    return str
}  

function toHex(str){
    let hexß
    try {
        hex = unescape(encodeURIComponent(str)).split('').map(function(v){
            return v.charCodeAt(0).toString(16)
        }).join('')
    } catch(e) {
        hex = str
        console.log('toHex: Invalid text input: ' + str)
    }
    return hex
}
