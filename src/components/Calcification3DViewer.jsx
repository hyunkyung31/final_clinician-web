import { useEffect, useRef } from "react";
import * as THREE from "three";

import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";


function Calcification3DViewer({
  stlUrl,
  height = 500,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !stlUrl) {
      return;
    }

    // --------------------------------------------------
    // Scene
    // --------------------------------------------------

    const scene = new THREE.Scene();

    scene.background = new THREE.Color(
      0xf5f7fa
    );


    // --------------------------------------------------
    // Camera
    // --------------------------------------------------

    const width = container.clientWidth;

    const camera = new THREE.PerspectiveCamera(
      45,
      width / height,
      0.1,
      10000
    );


    // --------------------------------------------------
    // Renderer
    // --------------------------------------------------

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    renderer.setPixelRatio(
      window.devicePixelRatio
    );

    renderer.setSize(
      width,
      height
    );

    container.appendChild(
      renderer.domElement
    );


    // --------------------------------------------------
    // OrbitControls
    //
    // 마우스:
    // 왼쪽 드래그 = 회전
    // 휠 = 확대/축소
    // 오른쪽 드래그 = 이동
    // --------------------------------------------------

    const controls = new OrbitControls(
      camera,
      renderer.domElement
    );

    controls.enableDamping = true;

    controls.dampingFactor = 0.08;


    // --------------------------------------------------
    // Lighting
    // --------------------------------------------------

    const ambientLight =
      new THREE.AmbientLight(
        0xffffff,
        1.5
      );

    scene.add(ambientLight);


    const directionalLight =
      new THREE.DirectionalLight(
        0xffffff,
        2.5
      );

    directionalLight.position.set(
      1,
      1,
      1
    );

    scene.add(directionalLight);


    const backLight =
      new THREE.DirectionalLight(
        0xffffff,
        1.2
      );

    backLight.position.set(
      -1,
      -1,
      -1
    );

    scene.add(backLight);


    // --------------------------------------------------
    // STL load
    // --------------------------------------------------

    const loader = new STLLoader();


    loader.load(

      stlUrl,

      (geometry) => {

        // STL에는 normal이 없는 경우도 있으므로 계산
        geometry.computeVertexNormals();


        // ----------------------------------------------
        // Bounding box 계산
        // ----------------------------------------------

        geometry.computeBoundingBox();


        const boundingBox =
          geometry.boundingBox;


        const center =
          new THREE.Vector3();


        boundingBox.getCenter(
          center
        );


        // ----------------------------------------------
        // 모델 중심을 (0,0,0)으로 이동
        // ----------------------------------------------

        geometry.translate(
          -center.x,
          -center.y,
          -center.z
        );


        // ----------------------------------------------
        // Mesh
        // ----------------------------------------------

        const material =
          new THREE.MeshStandardMaterial({

            color: 0xe5a000,

            roughness: 0.45,

            metalness: 0.05,

            side: THREE.DoubleSide,

          });


        const mesh =
          new THREE.Mesh(
            geometry,
            material
          );


        scene.add(mesh);


        // ----------------------------------------------
        // 크기 계산
        // ----------------------------------------------

        geometry.computeBoundingBox();


        const size =
          new THREE.Vector3();


        geometry.boundingBox.getSize(
          size
        );


        const maxDimension =
          Math.max(
            size.x,
            size.y,
            size.z
          );


        // ----------------------------------------------
        // Camera 자동 위치
        // ----------------------------------------------

        camera.position.set(
          maxDimension * 1.5,
          maxDimension * 1.2,
          maxDimension * 1.8
        );


        camera.near =
          Math.max(
            maxDimension / 100,
            0.01
          );


        camera.far =
          maxDimension * 100;


        camera.updateProjectionMatrix();


        controls.target.set(
          0,
          0,
          0
        );


        controls.update();
      },


      undefined,


      (error) => {

        console.error(
          "STL 로딩 실패:",
          error
        );

      }
    );


    // --------------------------------------------------
    // Animation
    // --------------------------------------------------

    let animationFrameId;


    const animate = () => {

      animationFrameId =
        requestAnimationFrame(
          animate
        );


      controls.update();


      renderer.render(
        scene,
        camera
      );

    };


    animate();


    // --------------------------------------------------
    // resize 대응
    // --------------------------------------------------

    const handleResize = () => {

      const newWidth =
        container.clientWidth;


      camera.aspect =
        newWidth / height;


      camera.updateProjectionMatrix();


      renderer.setSize(
        newWidth,
        height
      );

    };


    window.addEventListener(
      "resize",
      handleResize
    );


    // --------------------------------------------------
    // Cleanup
    // --------------------------------------------------

    return () => {

      window.removeEventListener(
        "resize",
        handleResize
      );


      cancelAnimationFrame(
        animationFrameId
      );


      controls.dispose();

      renderer.dispose();


      if (
        renderer.domElement.parentNode
      ) {

        renderer.domElement.parentNode.removeChild(
          renderer.domElement
        );

      }

    };

  }, [stlUrl, height]);


  return (

    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: `${height}px`,
        borderRadius: "12px",
        overflow: "hidden",
      }}
    />

  );
}


export default Calcification3DViewer;