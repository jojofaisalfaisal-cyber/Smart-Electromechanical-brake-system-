export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  description?: string;
}

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Google Drive session expired. Please sign in again.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

async function driveFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    throw new DriveAuthExpiredError();
  }
  if (!res.ok) {
    let detail = `Google Drive API error (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        detail = errJson.error.message;
      }
    } catch {
      // ignore non-JSON body
    }
    throw new Error(detail);
  }
  return res;
}

export async function listDriveFiles(
  token: string,
  options?: { query?: string; onlyBrakeSim?: boolean; pageSize?: number }
): Promise<DriveFileItem[]> {
  const clauses = ['trashed = false'];
  if (options?.onlyBrakeSim) {
    clauses.push("(name contains 'brake_sim_' or appProperties has { key='app' and value='smart-brake-sim' })");
  }
  if (options?.query && options.query.trim().length > 0) {
    const safe = options.query.trim().replace(/'/g, "\\'");
    clauses.push(`name contains '${safe}'`);
  }

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    pageSize: String(options?.pageSize ?? 25),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,size,modifiedTime,description)',
  });

  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    token
  );
  const data = (await res.json()) as { files?: DriveFileItem[] };
  return data.files ?? [];
}

export async function downloadDriveFileText(token: string, fileId: string): Promise<string> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    token
  );
  return res.text();
}

export async function createDriveFile(
  token: string,
  name: string,
  mimeType: string,
  content: string,
  description?: string
): Promise<DriveFileItem> {
  const metadata = {
    name,
    mimeType,
    description: description ?? 'Smart Electromechanical Brake System simulation export',
    appProperties: { app: 'smart-brake-sim' },
  };

  const boundary = 'brake_sim_multipart_boundary_' + Date.now();
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    content +
    `\r\n--${boundary}--`;

  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,description',
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  return (await res.json()) as DriveFileItem;
}

export async function updateDriveFile(
  token: string,
  fileId: string,
  mimeType: string,
  content: string
): Promise<DriveFileItem> {
  const res = await driveFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      fileId
    )}?uploadType=media&fields=id,name,mimeType,size,modifiedTime,description`,
    token,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': mimeType,
      },
      body: content,
    }
  );
  return (await res.json()) as DriveFileItem;
}

export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    token,
    { method: 'DELETE' }
  );
}
