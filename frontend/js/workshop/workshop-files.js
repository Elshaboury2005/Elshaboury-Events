/**
 * workshop-files.js
 * Frontend logic for the category Shared Documents library.
 */

(function () {
  const API_FILES = '/api/workshop/files';

  let allFiles = [];
  let currentUserId = window.wsMemberInfo ? window.wsMemberInfo.id : null;
  let currentUserRole = window.wsMemberInfo ? window.wsMemberInfo.role : null;

  // DOM Elements
  const uploadDropzone = document.getElementById('uploadDropzone');
  const fileBrowseInput = document.getElementById('fileBrowseInput');
  const uploadProgressContainer = document.getElementById('uploadProgressContainer');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const uploadProgressText = document.getElementById('uploadProgressText');
  const fileUploadMsg = document.getElementById('fileUploadMsg');
  const filesListBody = document.getElementById('filesListBody');

  const blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.bin', '.msi', '.jar', '.com', '.vbs', '.scr'];

  async function init() {
    await loadFiles();
    setupDropzone();
  }

  async function loadFiles() {
    try {
      const res = await fetch(API_FILES, { headers: window.wsHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      allFiles = data.files || [];
      renderFiles();
    } catch (err) {
      console.error('Failed to load files:', err);
      filesListBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;color:var(--danger);padding:40px 10px;">
            Error loading files: ${err.message}
          </td>
        </tr>`;
    }
  }

  function getFileIcon(fileName, type) {
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    if (ext === '.pdf') return '📕';
    if (['.doc', '.docx', '.odt'].includes(ext)) return '📘';
    if (['.xls', '.xlsx', '.ods', '.csv'].includes(ext)) return '📗';
    if (['.ppt', '.pptx', '.odp'].includes(ext)) return '📙';
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) return '🖼️';
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return '📦';
    if (['.txt', '.md', '.json', '.xml'].includes(ext)) return '📄';
    return '📄';
  }

  function formatBytes(bytes) {
    if (!bytes) return '—';
    const n = Number(bytes);
    if (isNaN(n)) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderFiles() {
    if (allFiles.length === 0) {
      filesListBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;color:var(--muted);padding:40px 10px;">
            No documents uploaded yet. Be the first to share a resource!
          </td>
        </tr>`;
      return;
    }

    filesListBody.innerHTML = allFiles.map(f => {
      const isUploader = f.uploaded_by === currentUserId;
      const isLead = currentUserRole === 'head' || currentUserRole === 'vice_head';
      const canDelete = isUploader || isLead;

      const icon = getFileIcon(f.file_name, f.file_type);
      const formattedSize = formatBytes(f.file_size_bytes);
      const dateStr = new Date(f.uploaded_at).toLocaleDateString('en-EG', {
        year: 'numeric', month: 'short', day: 'numeric'
      });

      return `
        <tr id="file-row-${f.id}">
          <td class="file-name-cell">
            <span class="file-icon">${icon}</span>
            <span title="${escapeHtml(f.file_name)}">${escapeHtml(f.file_name)}</span>
          </td>
          <td>${escapeHtml(f.uploader_email)}</td>
          <td>${formattedSize}</td>
          <td style="color:var(--muted);font-size:.8rem;">${dateStr}</td>
          <td>
            <div class="files-actions-cell">
              <a href="${f.file_path}" class="btn btn-sm btn-download" download="${escapeHtml(f.file_name)}">
                📥 Download
              </a>
              ${canDelete ? `
                <button class="btn btn-sm btn-danger" onclick="deleteFile(${f.id})" type="button">
                  🗑️ Delete
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function setupDropzone() {
    // Browse button triggering file input
    uploadDropzone.addEventListener('click', () => {
      fileBrowseInput.click();
    });

    fileBrowseInput.addEventListener('change', () => {
      if (fileBrowseInput.files.length > 0) {
        handleUpload(fileBrowseInput.files[0]);
      }
    });

    // Drag-and-drop actions
    uploadDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadDropzone.classList.add('dragover');
    });

    uploadDropzone.addEventListener('dragleave', () => {
      uploadDropzone.classList.remove('dragover');
    });

    uploadDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadDropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files[0]);
      }
    });
  }

  function handleUpload(file) {
    fileUploadMsg.className = 'ws-message';
    fileUploadMsg.textContent = '';
    
    if (!file) return;

    // Client-side validations
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (blockedExtensions.includes(ext)) {
      showUploadError('Executable files (.exe, .bat, .sh, etc.) are blocked for security reasons.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showUploadError('File exceeds the maximum limit of 20MB.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_FILES, true);
    
    // Set headers
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('workshopToken')}`);

    // Show Progress bar
    uploadProgressContainer.style.display = 'flex';
    updateProgressBar(0);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentage = Math.round((e.loaded / e.total) * 100);
        updateProgressBar(percentage);
      }
    };

    xhr.onload = async () => {
      uploadProgressContainer.style.display = 'none';
      
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status === 201 && data.success) {
          showUploadSuccess(`"${file.name}" uploaded successfully!`);
          await loadFiles();
        } else {
          showUploadError(data.message || 'Upload failed');
        }
      } catch (err) {
        showUploadError('Failed to parse server response.');
      }
    };

    xhr.onerror = () => {
      uploadProgressContainer.style.display = 'none';
      showUploadError('A network error occurred during upload.');
    };

    xhr.send(formData);
  }

  function updateProgressBar(percentage) {
    uploadProgressBar.style.width = `${percentage}%`;
    uploadProgressText.textContent = `${percentage}%`;
  }

  function showUploadError(text) {
    fileUploadMsg.className = 'ws-message error show';
    fileUploadMsg.textContent = text;
  }

  function showUploadSuccess(text) {
    fileUploadMsg.className = 'ws-message success show';
    fileUploadMsg.textContent = text;
    setTimeout(() => {
      fileUploadMsg.classList.remove('show');
    }, 4000);
  }

  window.deleteFile = async function (id) {
    if (!confirm('Are you sure you want to delete this document from the library?')) return;

    try {
      const res = await fetch(`${API_FILES}/${id}`, {
        method: 'DELETE',
        headers: window.wsHeaders()
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.message);

      // Remove from list
      const row = document.getElementById(`file-row-${id}`);
      if (row) row.remove();
      
      // Update in-memory copy
      allFiles = allFiles.filter(f => f.id !== id);
      if (allFiles.length === 0) {
        renderFiles();
      }
    } catch (err) {
      alert('Failed to delete file: ' + err.message);
    }
  };

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  init();

})();
