import React from 'react';
import type { CuttingResponse } from '../types';
import { StickerPrint } from '../components/StickerPrint';
import '../components/sticker-print.css';

interface StepResultsProps {
  results: CuttingResponse | null;
  onBack: () => void;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  projectName?: string;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMoney2(value: number) {
  return new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAreaM2(mm2: number) {
  return (mm2 / 1_000_000).toFixed(2);
}

export function StepResults({
  results,
  onBack,
  projectName,
}: StepResultsProps) {
  if (!results) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No Results</h2>
          <p className="text-gray-600 mb-6">No optimization result available.</p>
          <button
            onClick={onBack}
            className="px-6 py-3 border-2 border-orange-500 text-orange-600 rounded-xl font-semibold hover:bg-orange-50"
          >
            Back to Configuration
          </button>
        </div>
      </div>
    );
  }

  const pricing = results.boq?.pricing;
  const optimization = results.optimization;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Optimization Results</h2>
        <p className="text-gray-500">
          Report ID: <span className="font-medium">{results.report_id}</span>
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Global Statistics</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-xl p-5">
            <div className="text-gray-600 text-sm mb-2">Total Boards Used</div>
            <div className="text-4xl font-bold text-slate-900">{optimization.total_boards}</div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5">
            <div className="text-gray-600 text-sm mb-2">Total Panels</div>
            <div className="text-4xl font-bold text-slate-900">{optimization.total_panels}</div>
          </div>

          <div className="bg-green-50 rounded-xl p-5">
            <div className="text-green-700 text-sm mb-2">Used Area</div>
            <div className="text-4xl font-bold text-green-800">
              {formatAreaM2(optimization.total_used_area_mm2)} m²
            </div>
          </div>

          <div className="bg-red-50 rounded-xl p-5">
            <div className="text-red-700 text-sm mb-2">Waste Area</div>
            <div className="text-4xl font-bold text-red-800">
              {formatAreaM2(optimization.total_waste_mm2)} m²
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5">
            <div className="text-gray-600 text-sm mb-2">Total Cuts</div>
            <div className="text-4xl font-bold text-slate-900">{optimization.total_cuts}</div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5">
            <div className="text-gray-600 text-sm mb-2">Cut Length</div>
            <div className="text-4xl font-bold text-slate-900">
              {optimization.total_cut_length.toFixed(2)}m
            </div>
          </div>
        </div>

        {optimization.warnings && optimization.warnings.length > 0 && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <h3 className="font-semibold text-yellow-800 mb-2">Warnings</h3>
            <ul className="list-disc pl-5 text-yellow-700">
              {optimization.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Pricing</h2>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left py-4 px-4 font-bold">Item</th>
                <th className="text-left py-4 px-4 font-bold">Qty</th>
                <th className="text-left py-4 px-4 font-bold">Unit</th>
                <th className="text-left py-4 px-4 font-bold">Unit Price</th>
                <th className="text-left py-4 px-4 font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pricing?.lines?.map((line, index) => (
                <tr key={`${line.item}-${index}`} className="border-b">
                  <td className="py-4 px-4">{line.description}</td>
                  <td className="py-4 px-4">{line.quantity}</td>
                  <td className="py-4 px-4">{line.unit}</td>
                  <td className="py-4 px-4">{formatMoney(line.unit_price)}</td>
                  <td className="py-4 px-4">{formatMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 border-t pt-6 max-w-md ml-auto">
          <div className="flex justify-between py-2 text-2xl">
            <span>Subtotal:</span>
            <strong>{formatMoney(pricing?.subtotal || 0)}</strong>
          </div>

          <div className="flex justify-between py-2 text-2xl">
            <span>
              {pricing?.tax_name || 'VAT'} ({pricing?.tax_rate || 0}%):
            </span>
            <strong>{formatMoney2(pricing?.tax_amount || 0)}</strong>
          </div>

          <div className="flex justify-between mt-4 p-4 rounded-xl bg-orange-50 text-orange-600 text-3xl font-bold">
            <span>Total:</span>
            <strong>
              {formatMoney2(pricing?.total || 0)} {pricing?.currency || 'KES'}
            </strong>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-8">
        <StickerPrint
          stickers={results.stickers}
          projectName={projectName || results.request_summary?.project_name}
        />
      </div>

      <div className="flex justify-start no-print">
        <button
          onClick={onBack}
          className="px-8 py-4 border-2 border-orange-500 text-orange-600 rounded-2xl font-semibold text-xl hover:bg-orange-50 transition"
        >
          Back to Configuration
        </button>
      </div>
    </div>
  );
}
