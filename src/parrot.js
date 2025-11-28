import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { parseGIF, decompressFrames } from 'gifuct-js'

// シーンの作成
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a1a)

// カメラの作成
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
)
camera.position.z = 5

// レンダラーの作成
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

// ライトの追加（オプション）
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
scene.add(ambientLight)

// OrbitControls の追加
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true // 滑らかな操作のため
controls.dampingFactor = 0.05
controls.enableZoom = true
controls.enablePan = true
controls.autoRotate = false

// GIF アニメーション関連の変数
let gifFrames = []
let canvas = null
let ctx = null
let texture = null
let mesh = null
let frameIndex = 0
let animationId = null
let isPlaying = false
let playbackSpeed = 1.0
let shouldLoop = true

// GIF を読み込む関数
async function loadGIF(url) {
    try {
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const gif = parseGIF(arrayBuffer)
        gifFrames = decompressFrames(gif, true)

        if (gifFrames.length === 0) {
            throw new Error('フレームが見つかりませんでした')
        }

        // 既存のメッシュを削除
        if (mesh) {
            scene.remove(mesh)
            if (texture) {
                texture.dispose()
            }
        }

        // Canvas の作成
        // GIF 全体のサイズを使用（Logical Screen Descriptor から取得）
        canvas = document.createElement('canvas')
        ctx = canvas.getContext('2d')
        canvas.width = gif.lsd.width
        canvas.height = gif.lsd.height

        // 背景をクリア（透明にする）
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // CanvasTexture の作成
        texture = new THREE.CanvasTexture(canvas)
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter

        // マテリアルの作成
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        })

        // ジオメトリの作成（アスペクト比を保持）
        const aspectRatio = canvas.width / canvas.height
        const geometry = new THREE.PlaneGeometry(
            aspectRatio > 1 ? 4 : 4 * aspectRatio,
            aspectRatio > 1 ? 4 / aspectRatio : 4
        )

        // メッシュの作成
        mesh = new THREE.Mesh(geometry, material)
        scene.add(mesh)

        // 最初のフレームを表示
        frameIndex = 0
        displayFrame(0)

        // 自動再生開始
        startAnimation()

    } catch (error) {
        console.error('GIF の読み込みエラー:', error)
    }
}

// フレームを表示する関数
function displayFrame(index) {
    if (index < 0 || index >= gifFrames.length) return

    const frame = gifFrames[index]

    // 前のフレームをクリア（必要に応じて）
    if (frame.disposalType === 2) {
        // 背景色でクリア
        ctx.clearRect(
            frame.dims.left,
            frame.dims.top,
            frame.dims.width,
            frame.dims.height
        )
    } else if (frame.disposalType === 3) {
        // 前のフレームを復元（実装が複雑なため、ここでは簡易的に処理）
        // 実際の実装では、前のフレームの状態を保存する必要があります
    }

    // フレームデータを Canvas に描画
    // decompressFrames の第2引数に true を渡すと、patch は Uint8ClampedArray として返される
    // ImageData オブジェクトに変換する必要がある
    const imageData = new ImageData(
        frame.patch,
        frame.dims.width,
        frame.dims.height
    )
    ctx.putImageData(imageData, frame.dims.left, frame.dims.top)

    // テクスチャを更新
    texture.needsUpdate = true
}

// アニメーションを開始する関数
function startAnimation() {
    if (isPlaying || gifFrames.length === 0) return

    isPlaying = true

    function animateGIF() {
        if (!isPlaying) return

        const frame = gifFrames[frameIndex]
        displayFrame(frameIndex)

        // 次のフレームへ
        frameIndex++

        // ループ処理
        if (frameIndex >= gifFrames.length) {
            if (shouldLoop) {
                frameIndex = 0
            } else {
                isPlaying = false
                return
            }
        }

        // 次のフレームまでの遅延時間（ミリ秒）
        const delay = frame.delay || 100
        const adjustedDelay = delay / playbackSpeed

        animationId = setTimeout(animateGIF, adjustedDelay)
    }

    animateGIF()
}

// アニメーションループ（Three.js のレンダリング）
function animate() {
    requestAnimationFrame(animate)

    // OrbitControls の更新（滑らかな操作のため）
    controls.update()

    renderer.render(scene, camera)
}

// ウィンドウリサイズの処理
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})

// ページ読み込み時に自動的に GIF を読み込む
loadGIF('/60fpsparrot.gif')

// アニメーション開始
animate()
