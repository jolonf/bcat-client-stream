window.addEventListener('load', async () => {
    loadVideo()
})

function loadVideo() {
    const masterTx = document.getElementById('tx').value
    const video = document.querySelector('video.bcat-video')

    loadBCatVideo(video, masterTx)
}

async function loadBCatVideo(videoElement, masterTx) {
    videoElement.src = await bcat(masterTx, (type, properties) => {
        videoElement.play()
        switch (type) {
            case 'fetch':
                document.getElementById('status').innerHTML = `Fetching ${properties.segment} of ${properties.arguments}...`
                break;
            case 'done':
                document.getElementById('status').innerHTML = `Download complete`
                break;
        }
    })
}

// Returns an objectUrl promise which can be assigned to video.src
// e.g. video.src = await bcat(masterTx)
// with callback:
// video.src = await bcat(masterTx, (type, properties) => {
//    if (type === 'update') console.log(properties.segment + ' of ' + properties.arguments)
//    if (type === 'done') console.log('Done')
// })
async function bcat(masterTx, cb) {
    if ('MediaSource' in window) {
        const bcatArguments = await getBCatArguments(masterTx)
        //const mimeCodec = fromHex(bcatArguments[2])
        const mimeCodec = 'video/webm;codecs="vp9,opus"' // Hardcoded for Shem's video
        const fileName = fromHex(bcatArguments[4])
        console.log(`mime codec: ${mimeCodec}`)
        console.log(`filename: ${fileName}`)
    
        if (MediaSource.isTypeSupported(mimeCodec)) {
            var mediaSource = new MediaSource()
            console.log(mediaSource.readyState) // closed
            mediaSource.addEventListener('sourceopen', async () => {
                console.log(this.readyState) // open
                const sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
                for (let segment = 6; segment < bcatArguments.length; segment++) {
                    const tx = bcatArguments[segment]
                    const url = 'https://bico.media/' + tx
                    console.log(`fetching segment [${segment}] ${url}`)
                    if (cb) cb('fetch', {segment: segment, arguments: bcatArguments.length})
                    const response = await fetch(url)
                    const arrayBuffer = await response.arrayBuffer()
                    sourceBuffer.appendBuffer(arrayBuffer);
                }
                mediaSource.endOfStream();
                if (cb) cb('done', {})
            });
            return URL.createObjectURL(mediaSource)
        } else {
            console.error('Unsupported MIME type or codec: ', mimeCodec);
        }
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
