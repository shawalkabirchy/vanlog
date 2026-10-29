import { Suspense } from "react";
import { EquipmentDetail } from "@/components/equipment-detail";
import { Loading } from "@/components/common";
export default function EquipmentDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EquipmentDetail />
    </Suspense>
  );
}
