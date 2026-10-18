// Zenframe Assistant 1.3.0: tells the panel when After Effects is playing sound, so Zeni can dance during playback.
// Reads only the output level (a number from 0 to 1) of After Effects' own audio sessions through the Windows
// audio meter API. No audio is recorded, saved or sent anywhere. Exits when the panel closes (stdin ends).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace Zenframe
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCo { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }

    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int Item(uint index, out IMMDevice device);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr guid, int flags, out IntPtr control);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr guid, int flags, out IntPtr volume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
    }

    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
    }

    [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName(out IntPtr name);
        [PreserveSig] int SetDisplayName(IntPtr name, IntPtr context);
        [PreserveSig] int GetIconPath(out IntPtr path);
        [PreserveSig] int SetIconPath(IntPtr path, IntPtr context);
        [PreserveSig] int GetGroupingParam(out Guid param);
        [PreserveSig] int SetGroupingParam(ref Guid param, IntPtr context);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int GetSessionIdentifier(out IntPtr id);
        [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
        [PreserveSig] int GetProcessId(out uint pid);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference(bool optOut);
    }

    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioMeterInformation
    {
        [PreserveSig] int GetPeakValue(out float peak);
    }

    public static class AudioMeter
    {
        static volatile bool quit;

        static HashSet<uint> AePids()
        {
            var set = new HashSet<uint>();
            foreach (var p in Process.GetProcessesByName("AfterFX")) { set.Add((uint)p.Id); p.Dispose(); }
            return set;
        }

        static List<IAudioMeterInformation> FindMeters(IMMDeviceEnumerator en, out int sessions)
        {
            var meters = new List<IAudioMeterInformation>();
            sessions = 0;
            var pids = AePids();
            if (pids.Count == 0) return meters;
            IMMDeviceCollection devices;
            if (en.EnumAudioEndpoints(0 /* render */, 1 /* active */, out devices) != 0 || devices == null) return meters;
            uint count; devices.GetCount(out count);
            Guid iid = typeof(IAudioSessionManager2).GUID;
            for (uint d = 0; d < count; d++)
            {
                try
                {
                    IMMDevice dev; if (devices.Item(d, out dev) != 0 || dev == null) continue;
                    object o; if (dev.Activate(ref iid, 23 /* CLSCTX_ALL */, IntPtr.Zero, out o) != 0 || o == null) continue;
                    var mgr = (IAudioSessionManager2)o;
                    IAudioSessionEnumerator list; if (mgr.GetSessionEnumerator(out list) != 0 || list == null) continue;
                    int n; list.GetCount(out n);
                    for (int i = 0; i < n; i++)
                    {
                        IAudioSessionControl2 s; if (list.GetSession(i, out s) != 0 || s == null) continue;
                        uint pid; s.GetProcessId(out pid);
                        if (!pids.Contains(pid)) continue;
                        sessions++;
                        meters.Add((IAudioMeterInformation)s);
                    }
                }
                catch (Exception) { }
            }
            return meters;
        }

        public static void Run()
        {
            var stdin = new Thread(() => { try { while (Console.In.ReadLine() != null) { } } catch (Exception) { } quit = true; });
            stdin.IsBackground = true; stdin.Start();
            var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
            var meters = new List<IAudioMeterInformation>();
            var sw = Stopwatch.StartNew();
            long lastScan = -100000; int lastSessions = -1; float lastOut = -1;
            Console.Out.WriteLine("ready"); Console.Out.Flush();
            while (!quit)
            {
                long ms = sw.ElapsedMilliseconds;
                // After Effects opens its audio session when it first plays, so look again now and then.
                if (ms - lastScan > (meters.Count == 0 ? 700 : 3000))
                {
                    int sessions;
                    try { meters = FindMeters(en, out sessions); } catch (Exception) { meters = new List<IAudioMeterInformation>(); sessions = 0; }
                    lastScan = ms;
                    if (sessions != lastSessions) { Console.Out.WriteLine("sessions " + sessions); lastSessions = sessions; }
                }
                float peak = 0;
                foreach (var m in meters) { try { float p; if (m.GetPeakValue(out p) == 0 && p > peak) peak = p; } catch (Exception) { lastScan = -100000; } }
                if (Math.Abs(peak - lastOut) > 0.0005 || peak > 0.0005)
                {
                    Console.Out.WriteLine("p " + peak.ToString("0.0000", System.Globalization.CultureInfo.InvariantCulture));
                    lastOut = peak;
                }
                Console.Out.Flush();
                Thread.Sleep(20);
            }
        }
    }
}
