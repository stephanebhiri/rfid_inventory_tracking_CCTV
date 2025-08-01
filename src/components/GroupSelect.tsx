import React, { useState, useEffect } from 'react';

interface Group {
  id: string;
  group_id: string;
  group_name: string;
  color: string;
}

interface GroupSelectProps {
  value: number;
  onChange: (value: number) => void;
  name: string;
  id: string;
}

const GroupSelect: React.FC<GroupSelectProps> = ({ value, onChange, name, id }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await fetch('/api/groups');
        if (response.ok) {
          const data = await response.json();
          setGroups(data.success ? data.data : data);
        }
      } catch (error) {
        console.error('Failed to fetch groups:', error);
        // Fallback to default groups
        setGroups([
          { id: '1', group_id: '1', group_name: 'ENG1', color: '#1e40af' },
          { id: '2', group_id: '2', group_name: 'ENG2', color: '#dc2626' },
          { id: '3', group_id: '3', group_name: 'ENG3', color: '#059669' },
          { id: '4', group_id: '4', group_name: 'ENG4', color: '#7c2d12' },
          { id: '5', group_id: '5', group_name: 'SPARE', color: '#4338ca' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(parseInt(e.target.value));
  };

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={handleChange}
      disabled={loading}
    >
      {loading ? (
        <option>Chargement...</option>
      ) : (
        groups.map((group) => (
          <option key={group.group_id} value={parseInt(group.group_id)}>
            {group.group_name}
          </option>
        ))
      )}
    </select>
  );
};

export default GroupSelect;