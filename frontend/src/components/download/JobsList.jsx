import React, { useState, useEffect } from "react";

export default function JobsList() {
  const [jobs, setJobs] = useState([]);

  // Fake polling for demonstration (replace with SSE or API call)
  useEffect(() => {
    const interval = setInterval(() => {
      // Replace below with actual API call to fetch job list
      setJobs((prev) => [
        ...prev,
        { id: Date.now(), title: "Sample Video", type: "mp4", progress: Math.floor(Math.random() * 100) },
      ]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (jobs.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-2">Download Jobs</h3>
      <ul className="space-y-2">
        {jobs.map((job) => (
          <li key={job.id} className="flex justify-between items-center bg-gray-100 p-3 rounded">
            <div>
              <p className="font-medium">{job.title}</p>
              <p className="text-sm text-gray-500">{job.type.toUpperCase()}</p>
            </div>
            <progress value={job.progress} max="100" className="w-32 h-3" />
          </li>
        ))}
      </ul>
    </div>
  );
}
