import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { parseGIF, decompressFrames } from 'gifuct-js'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

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
let baseCanvas = null
let baseCtx = null
let baseTexture = null
let baseMaterial = null
let baseGeometry = null

// メッシュ管理用の配列
let meshes = [] // { mesh, canvas, ctx, texture, frameIndex, animationId, floatAnimation, moveAnimation }
let spawnInterval = null // 一定間隔で生成するためのインターバル
let spawnIntervalTime = 10000 // 3秒ごとに新しいオブジェクトを生成
let isSpawning = false // 生成中かどうか
let scrollTriggerInstance = null // ScrollTriggerインスタンス

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

        // 既存のメッシュをすべて削除
        clearAllMeshes()

        // ベースCanvasの作成（テンプレート用）
        baseCanvas = document.createElement('canvas')
        baseCtx = baseCanvas.getContext('2d')
        baseCanvas.width = gif.lsd.width
        baseCanvas.height = gif.lsd.height

        // 背景をクリア（透明にする）
        baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height)

        // ベースTextureの作成
        baseTexture = new THREE.CanvasTexture(baseCanvas)
        baseTexture.minFilter = THREE.LinearFilter
        baseTexture.magFilter = THREE.LinearFilter

        // ベースマテリアルの作成
        baseMaterial = new THREE.MeshBasicMaterial({
            map: baseTexture,
            transparent: true,
            side: THREE.DoubleSide
        })

        // ベースジオメトリの作成（アスペクト比を保持）
        const aspectRatio = baseCanvas.width / baseCanvas.height
        baseGeometry = new THREE.PlaneGeometry(
            aspectRatio > 1 ? 4 : 4 * aspectRatio,
            aspectRatio > 1 ? 4 / aspectRatio : 4
        )

        // スクロールトリガーの設定（GIF読み込み完了後）
        setupScrollTrigger()

    } catch (error) {
        console.error('GIF の読み込みエラー:', error)
    }
}

// フレームを表示する関数（特定のメッシュ用）
function displayFrameForMesh(meshData, index) {
    if (index < 0 || index >= gifFrames.length) return

    const frame = gifFrames[index]
    const ctx = meshData.ctx

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
    }

    // フレームデータを Canvas に描画
    const imageData = new ImageData(
        frame.patch,
        frame.dims.width,
        frame.dims.height
    )
    ctx.putImageData(imageData, frame.dims.left, frame.dims.top)

    // テクスチャを更新
    meshData.texture.needsUpdate = true
}

// 新しいメッシュを作成する関数
function createNewMesh() {
    if (gifFrames.length === 0 || !baseMaterial || !baseGeometry) {
        console.warn('createNewMesh: 必要なリソースが準備できていません')
        return
    }

    console.log('新しいメッシュを作成します')

    // 各メッシュ用のCanvasとTextureを作成
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = baseCanvas.width
    canvas.height = baseCanvas.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter

    // マテリアルを作成（テクスチャを共有）
    const material = baseMaterial.clone()
    material.map = texture

    // メッシュを作成
    const mesh = new THREE.Mesh(baseGeometry, material)

    // 初期位置を下に設定（画面外）
    mesh.position.y = -6
    mesh.position.x = 0
    // 初期スケールを0に設定（非表示）
    mesh.scale.set(0, 0, 0)

    scene.add(mesh)

    // 最初のフレームを表示（静止状態）
    const frameIndex = 0
    displayFrameForMesh({ ctx, texture }, frameIndex)

    // メッシュデータを保存
    const meshData = {
        mesh,
        canvas,
        ctx,
        texture,
        frameIndex,
        animationId: null,
        floatAnimation: null,
        moveAnimation: null,
        isPlaying: false
    }

    meshes.push(meshData)
    console.log(`メッシュを作成しました。現在のメッシュ数: ${meshes.length}`)

    // アニメーションを開始
    animateMesh(meshData)
}

// メッシュのアニメーションを開始する関数
function animateMesh(meshData) {
    const { mesh } = meshData

    // 下から上に移動しながら拡大するアニメーション（即座に開始）
    gsap.to(mesh.position, {
        y: -2,
        duration: 1.5,
        ease: 'power2.out'
    })

    // スケールアニメーション（完了時にGIFアニメーションを開始）
    gsap.to(mesh.scale, {
        x: 0.5,
        y: 0.5,
        z: 0.5,
        duration: 1.5,
        ease: 'power2.out',
        onComplete: () => {
            // スケールアニメーション完了後にGIFアニメーションを開始
            startMeshAnimation(meshData)
        }
    })
}

// メッシュのGIFアニメーションを開始
function startMeshAnimation(meshData) {
    if (meshData.isPlaying) return

    meshData.isPlaying = true
    const { mesh } = meshData

    // ふわふわしながら右側に移動するアニメーション
    const currentY = mesh.position.y

    // ふわふわした動き（上下に揺れる）
    meshData.floatAnimation = gsap.to(mesh.position, {
        y: currentY + 0.1,
        duration: 1.5,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true
    })

    // 右側にゆっくり移動（画面外まで）
    const targetX = 6 // 画面外の位置
    meshData.moveAnimation = gsap.to(mesh.position, {
        x: targetX,
        duration: 50,
        ease: 'power1.out',
        onComplete: () => {
            // 画面外に出たら削除
            removeMesh(meshData)
        }
    })

    // GIFアニメーション
    function animateGIF() {
        if (!meshData.isPlaying) return

        displayFrameForMesh(meshData, meshData.frameIndex)

        // 次のフレームへ
        meshData.frameIndex++

        // ループ処理
        if (meshData.frameIndex >= gifFrames.length) {
            meshData.frameIndex = 0
        }

        // 次のフレームまでの遅延時間（ミリ秒）
        const frame = gifFrames[meshData.frameIndex]
        const delay = frame.delay || 100

        meshData.animationId = setTimeout(animateGIF, delay)
    }

    animateGIF()
}

// メッシュのアニメーションを停止
function stopMeshAnimation(meshData) {
    meshData.isPlaying = false

    if (meshData.animationId) {
        clearTimeout(meshData.animationId)
        meshData.animationId = null
    }

    if (meshData.floatAnimation) {
        meshData.floatAnimation.kill()
        meshData.floatAnimation = null
    }

    if (meshData.moveAnimation) {
        meshData.moveAnimation.kill()
        meshData.moveAnimation = null
    }

    // 最初のフレームに戻す
    meshData.frameIndex = 0
    if (gifFrames.length > 0) {
        displayFrameForMesh(meshData, 0)
    }
}

// メッシュを削除
function removeMesh(meshData) {
    stopMeshAnimation(meshData)
    scene.remove(meshData.mesh)
    meshData.texture.dispose()
    meshData.mesh.geometry.dispose()
    meshData.mesh.material.dispose()

    const index = meshes.indexOf(meshData)
    if (index > -1) {
        meshes.splice(index, 1)
    }
}

// すべてのメッシュを削除
function clearAllMeshes() {
    meshes.forEach(meshData => {
        stopMeshAnimation(meshData)
        scene.remove(meshData.mesh)
        meshData.texture.dispose()
        meshData.mesh.geometry.dispose()
        meshData.mesh.material.dispose()
    })
    meshes = []
}

// スクロールトリガーの設定
function setupScrollTrigger() {
    // 既存のScrollTriggerを削除
    if (scrollTriggerInstance) {
        scrollTriggerInstance.kill()
        scrollTriggerInstance = null
    }

    // スクロール位置を監視してオブジェクトを生成
    let lastScrollY = window.scrollY
    let scrollCheckInterval = null

    function checkScrollPosition() {
        const scrollY = window.scrollY
        const documentHeight = document.documentElement.scrollHeight - window.innerHeight
        const scrollPercent = (scrollY / documentHeight) * 100

        if (scrollPercent >= 50 && !isSpawning) {
            console.log('スクロール50%到達 - オブジェクト生成開始')
            isSpawning = true
            // 最初のオブジェクトを即座に作成
            createNewMesh()
            // 一定間隔で新しいオブジェクトを生成
            spawnInterval = setInterval(() => {
                createNewMesh()
            }, spawnIntervalTime)
        } else if (scrollPercent < 50 && isSpawning) {
            console.log('スクロール50%未満 - オブジェクト生成停止')
            // スクロールが戻ったらすべて停止
            if (spawnInterval) {
                clearInterval(spawnInterval)
                spawnInterval = null
            }
            isSpawning = false
            clearAllMeshes()
        }
    }

    // スクロールイベントで監視
    window.addEventListener('scroll', checkScrollPosition)

    // 初期チェック
    checkScrollPosition()

    // ScrollTriggerインスタンスとして保存（後で削除できるように）
    scrollTriggerInstance = {
        kill: () => {
            window.removeEventListener('scroll', checkScrollPosition)
            if (scrollCheckInterval) {
                clearInterval(scrollCheckInterval)
            }
        }
    }

    // ScrollTriggerを更新（ページの高さが変わった場合に備えて）
    ScrollTrigger.refresh()
}


// アニメーションループ（Three.js のレンダリング）
function animate() {
    requestAnimationFrame(animate)

    // OrbitControls の更新（滑らかな操作のため）
    controls.update()

    // 画面外に出たメッシュを削除（念のため）
    // 逆順に走査して、削除してもインデックスがずれないようにする
    for (let i = meshes.length - 1; i >= 0; i--) {
        const meshData = meshes[i]
        if (meshData.mesh.position.x > 5) {
            // 画面外に出ている場合は削除
            removeMesh(meshData)
        }
    }

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
