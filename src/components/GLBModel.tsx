import { Suspense } from "react";
import { useGLTF, Environment, ContactShadows, Html } from "@react-three/drei";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} scale={1} position={[0, -0.5, 0]} />;
}

export function GLBModel({ url }: { url: string }) {
  return (
    <Suspense
      fallback={
        <Html center>
          <div className="bg-black/80 text-white px-6 py-3 rounded-full text-sm backdrop-blur-md border border-white/10">
            Učitavanje 3D modela...
          </div>
        </Html>
      }
    >
      <Model url={url} />
      <Environment preset="night" />
      <ContactShadows position={[0, -0.48, 0]} opacity={0.6} blur={2.4} scale={20} far={5} />
    </Suspense>
  );
}

useGLTF.preload("/models/default.glb");
