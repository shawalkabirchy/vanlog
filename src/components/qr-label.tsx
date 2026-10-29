"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Download, Printer, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Failure, Loading } from "./common";
import { downloadBlob } from "@/lib/download";
import type { Equipment } from "@/lib/types";

export function QrLabel({ equipment }: { equipment: Equipment }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <QrCode data-icon="inline-start" />
          QR label
        </Button>
      </DialogTrigger>
      <DialogContent className="label-dialog">
        <DialogHeader>
          <DialogTitle>Equipment QR label</DialogTitle>
          <DialogDescription>
            Scan with your phone’s camera. Sign-in is required to view the
            record.
          </DialogDescription>
        </DialogHeader>
        {open && <LabelContent equipment={equipment} />}
      </DialogContent>
    </Dialog>
  );
}
function LabelContent({ equipment }: { equipment: Equipment }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let active = true;
    import("qrcode")
      .then((q) =>
        q.toString(window.location.origin + `/equipment/${equipment.id}`, {
          type: "svg",
          errorCorrectionLevel: "M",
          margin: 3,
          width: 256,
        }),
      )
      .then((value) => {
        if (active) setSvg(value);
      })
      .catch((error) => {
        if (active) setError(error);
      });
    return () => {
      active = false;
    };
  }, [equipment.id]);
  function print() {
    document.body.dataset.print = "label";
    window.addEventListener(
      "afterprint",
      () => {
        delete document.body.dataset.print;
      },
      { once: true },
    );
    window.print();
  }
  return (
    <>
      <Failure error={error} />
      {svg ? (
        <>
          <div className="print-label">
            <strong>VanLog</strong>
            <Image
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
              alt={`QR code for ${equipment.name}`}
              width={256}
              height={256}
              unoptimized
            />
            <h2>{equipment.name}</h2>
            <p>{equipment.category}</p>
            <small>Scan to log hours or service</small>
          </div>
          <div className="form-actions no-print">
            <Button
              onClick={() =>
                downloadBlob(
                  svg,
                  "image/svg+xml",
                  `vanlog-label-${equipment.id}.svg`,
                )
              }
            >
              <Download data-icon="inline-start" />
              Download SVG
            </Button>
            <Button variant="outline" onClick={print}>
              <Printer data-icon="inline-start" />
              Print label
            </Button>
          </div>
        </>
      ) : (
        !error && <Loading label="Generating label…" />
      )}
    </>
  );
}
