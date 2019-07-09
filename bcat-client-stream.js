window.addEventListener('load', async () => {
    loadVideo()
})

function loadVideo() {
    const masterTx = document.getElementById('tx').value
    const video = document.querySelector('video.bcat-video')

    loadBCatVideo(video, masterTx)
}

async function loadBCatVideo(videoElement, masterTx) {
    const bcatArguments = await getBCatArguments(masterTx)
    //const mimeCodec = fromHex(bcatArguments[2])
    const mimeCodec = 'video/webm;codecs="vp9,opus"' // Hardcoded for Shem's video
    const fileName = fromHex(bcatArguments[4])
    console.log(`mime codec: ${mimeCodec}`)
    console.log(`filename: ${fileName}`)

    if ('MediaSource' in window && MediaSource.isTypeSupported(mimeCodec)) {
        var mediaSource = new MediaSource()
        console.log(mediaSource.readyState) // closed
        videoElement.src = URL.createObjectURL(mediaSource)
        mediaSource.addEventListener('sourceopen', async () => {
            console.log(this.readyState) // open
            const sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
            for (segment = 6; segment < bcatArguments.length; segment++) {
                const tx = bcatArguments[segment]
                const url = 'https://bico.media/' + tx
                console.log(`fetching segment [${segment}] ${url}`)
                document.getElementById('status').innerHTML = `Fetching ${segment} of ${bcatArguments.length}...`
                const response = await fetch(url)
                const arrayBuffer = await response.arrayBuffer()
                sourceBuffer.appendBuffer(arrayBuffer);
                videoElement.play();
            }
            mediaSource.endOfStream();
            document.getElementById('status').innerHTML = `Download complete`
        });
    } else {
        console.error('Unsupported MIME type or codec: ', mimeCodec);
    }
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
