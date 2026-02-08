import React, { useState } from 'react';
import { Settings, Plus, X, Trash2, Layout } from 'lucide-react';

import { getUiScheme } from '../uiScheme';
import { API_HOST } from '../apiHost';

const AdminPanel = ({ config, isOpen, onClose, uiScheme }) => {
    const [activeTab, setActiveTab] = useState('sensors');

    const resolvedUiScheme = uiScheme || getUiScheme(config?.ui?.accentColorId);

    // Sensor Form State
    const [newSensor, setNewSensor] = useState({ id: '', roomId: '', label: '', type: 'entry', statusUri: '' });

    // Room Form State
    const [newRoom, setNewRoom] = useState({ id: '', name: '', floor: 1, gridArea: 'span 1' });

    if (!isOpen) return null;

    // --- Actions ---

    const handleAddSensor = async (e) => {
        e.preventDefault();
        try {
            const payload = { ...newSensor, metadata: { statusUri: newSensor.statusUri } };
            await fetch(`${API_HOST}/api/sensors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            alert('Sensor added!');
            setNewSensor({ id: '', roomId: '', label: '', type: 'entry', statusUri: '' });
        } catch (err) { console.error(err); }
    };

    const handleDeleteSensor = async (id) => {
        if (!confirm('Delete this sensor?')) return;
        try {
            await fetch(`${API_HOST}/api/sensors/${id}`, { method: 'DELETE' });
        } catch (err) { console.error(err); }
    };

    const handleAddRoom = async (e) => {
        e.preventDefault();
        try {
            await fetch(`${API_HOST}/api/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newRoom)
            });
            alert('Room added!');
            setNewRoom({ id: '', name: '', floor: 1, gridArea: 'span 1' });
        } catch (err) { console.error(err); }
    };

    const handleDeleteRoom = async (id) => {
        if (!confirm('Delete this room?')) return;
        try {
            await fetch(`${API_HOST}/api/rooms/${id}`, { method: 'DELETE' });
        } catch (err) { console.error(err); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-surface border border-white/10 w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Settings size={20} /> Configuration
                        </h2>
                        <div className="flex bg-black/50 rounded p-1">
                            <button
                                onClick={() => setActiveTab('sensors')}
                                className={`px-4 py-1 rounded text-sm font-medium transition-colors ${activeTab === 'sensors' ? resolvedUiScheme.tabActive : 'text-gray-400 hover:text-white'}`}
                            >
                                Sensors
                            </button>
                            <button
                                onClick={() => setActiveTab('rooms')}
                                className={`px-4 py-1 rounded text-sm font-medium transition-colors ${activeTab === 'rooms' ? resolvedUiScheme.tabActive : 'text-gray-400 hover:text-white'}`}
                            >
                                Rooms
                            </button>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">

                    {/* --- SENSORS TAB --- */}
                    {activeTab === 'sensors' && (
                        <div className="space-y-8">
                            {/* Add Sensor Form */}
                            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                                <h3 className={`text-md font-bold mb-4 flex items-center gap-2 ${resolvedUiScheme.selectedText}`}><Plus size={16} /> Add Sensor</h3>
                                <form onSubmit={handleAddSensor} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input type="text" placeholder="ID (e.g., front_door)" required value={newSensor.id} onChange={e => setNewSensor({ ...newSensor, id: e.target.value })} className={`bg-black/50 border border-white/10 rounded p-2 outline-none ${resolvedUiScheme.focusRing}`} />
                                    <input type="text" placeholder="Label (e.g., Front Door)" required value={newSensor.label} onChange={e => setNewSensor({ ...newSensor, label: e.target.value })} className={`bg-black/50 border border-white/10 rounded p-2 outline-none ${resolvedUiScheme.focusRing}`} />
                                    <select required value={newSensor.roomId} onChange={e => setNewSensor({ ...newSensor, roomId: e.target.value })} className={`bg-black/50 border border-white/10 rounded p-2 outline-none ${resolvedUiScheme.focusRing}`}>
                                        <option value="">Select Room...</option>
                                        {config.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                    <select value={newSensor.type} onChange={e => setNewSensor({ ...newSensor, type: e.target.value })} className={`bg-black/50 border border-white/10 rounded p-2 outline-none ${resolvedUiScheme.focusRing}`}>
                                        <option value="entry">Entry</option>
                                        <option value="window">Window</option>
                                        <option value="motion">Motion</option>
                                    </select>
                                    <input type="url" placeholder="Status URI (for polling)" value={newSensor.statusUri} onChange={e => setNewSensor({ ...newSensor, statusUri: e.target.value })} className={`bg-black/50 border border-white/10 rounded p-2 outline-none col-span-2 ${resolvedUiScheme.focusRing}`} />
                                    <button type="submit" className={`col-span-2 border text-white py-2 rounded font-medium transition-colors hover:bg-white/5 ${resolvedUiScheme.actionButton}`}>Add Sensor</button>
                                </form>
                            </div>

                            {/* Sensor List */}
                            <div>
                                <h3 className="text-md font-bold mb-4 text-gray-400">Existing Sensors</h3>
                                <div className="border border-white/10 rounded-lg overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-white/5 text-gray-500 uppercase tracking-wider text-xs">
                                            <tr>
                                                <th className="p-3">ID</th>
                                                <th className="p-3">Label</th>
                                                <th className="p-3">Room</th>
                                                <th className="p-3">Type</th>
                                                <th className="p-3">Polling URI</th>
                                                <th className="p-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/10">
                                            {config.sensors.map(s => (
                                                <tr key={s.id} className="hover:bg-white/5">
                                                    <td className="p-3 font-mono text-xs text-gray-400">{s.id}</td>
                                                    <td className="p-3">{s.label}</td>
                                                    <td className="p-3 text-gray-400">{config.rooms.find(r => r.id === s.roomId)?.name || s.roomId}</td>
                                                    <td className="p-3 text-gray-400 capitalize">{s.type}</td>
                                                    <td className="p-3 text-xs text-blue-400 truncate max-w-[150px]">{s.metadata?.statusUri || '-'}</td>
                                                    <td className="p-3 text-right">
                                                        <button onClick={() => handleDeleteSensor(s.id)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={16} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- ROOMS TAB --- */}
                    {activeTab === 'rooms' && (
                        <div className="space-y-8">
                            {/* Add Room Form */}
                            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                                <h3 className="text-md font-bold mb-4 flex items-center gap-2 text-neon-green"><Layout size={16} /> Add Room</h3>
                                <form onSubmit={handleAddRoom} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input type="text" placeholder="ID (e.g., kitchen)" required value={newRoom.id} onChange={e => setNewRoom({ ...newRoom, id: e.target.value })} className={`bg-black/50 border border-white/10 rounded p-2 outline-none ${resolvedUiScheme.focusRing}`} />
                                    <input type="text" placeholder="Name (e.g., Kitchen)" required value={newRoom.name} onChange={e => setNewRoom({ ...newRoom, name: e.target.value })} className={`bg-black/50 border border-white/10 rounded p-2 outline-none ${resolvedUiScheme.focusRing}`} />
                                    <select value={newRoom.floor} onChange={e => setNewRoom({ ...newRoom, floor: e.target.value })} className={`bg-black/50 border border-white/10 rounded p-2 outline-none ${resolvedUiScheme.focusRing}`}>
                                        <option value="1">Level 1</option>
                                        <option value="2">Level 2</option>
                                    </select>
                                    <input type="text" placeholder="Grid Area (e.g., span 2)" value={newRoom.gridArea} onChange={e => setNewRoom({ ...newRoom, gridArea: e.target.value })} className={`bg-black/50 border border-white/10 rounded p-2 outline-none ${resolvedUiScheme.focusRing}`} />
                                    <button type="submit" className="col-span-2 bg-success hover:bg-green-600 text-white py-2 rounded font-medium transition-colors">Add Room</button>
                                </form>
                            </div>

                            {/* Room List */}
                            <div>
                                <h3 className="text-md font-bold mb-4 text-gray-400">Existing Rooms</h3>
                                <div className="border border-white/10 rounded-lg overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-white/5 text-gray-500 uppercase tracking-wider text-xs">
                                            <tr>
                                                <th className="p-3">ID</th>
                                                <th className="p-3">Name</th>
                                                <th className="p-3">Floor</th>
                                                <th className="p-3">Grid</th>
                                                <th className="p-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/10">
                                            {config.rooms.map(r => (
                                                <tr key={r.id} className="hover:bg-white/5">
                                                    <td className="p-3 font-mono text-xs text-gray-400">{r.id}</td>
                                                    <td className="p-3">{r.name}</td>
                                                    <td className="p-3">{r.floor}</td>
                                                    <td className="p-3 font-mono text-xs">{r.gridArea}</td>
                                                    <td className="p-3 text-right">
                                                        <button onClick={() => handleDeleteRoom(r.id)} className="text-red-500 hover:text-red-400 p-1"><Trash2 size={16} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
